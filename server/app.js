/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const express = require('express')

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('./CAUtil.js');
const { buildCCPOrg1, buildCCPOrg2, buildWallet } = require('./AppUtil.js');

const channelName = 'mychannel';
const chaincodeName = 'basic8';
const contractName = "AssetTransferContract";

const mspOrg1 = 'Org1MSP';
const walletPath = path.join(__dirname, 'wallet');
const walletPathOrg2 = path.join(__dirname, 'walletOrg2');
const org1UserId = 'appUser';
const org2UserId = 'appUserOrg2';

let ccp = null;
let wallet = null;
let caClient = null;

let walletOrg2 = null;
let ccpOrg2 = null;

function prettyJSONString(inputString) {
  return JSON.stringify(JSON.parse(inputString), null, 2);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function init() {
  try {
    // tạo common connection profile cho org1 (chứa các cài đặt network)
    ccp = buildCCPOrg1();

    // tạo fabric ca services client dựa trên ccp đó
    caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');

    // setup wallet để  giữ credentials của các user
    wallet = await buildWallet(Wallets, walletPath);

    await enrollAdmin(caClient, wallet, mspOrg1);
    await registerAndEnrollUser(caClient, wallet, mspOrg1, org1UserId, 'org1.department1');

    walletOrg2 = await buildWallet(Wallets, walletPathOrg2);
    ccpOrg2 = buildCCPOrg2();
    let caClientCCP2 = buildCAClient(FabricCAServices, ccpOrg2, 'ca.org2.example.com');
    await enrollAdmin(caClientCCP2, walletOrg2, "mspOrg2");
    await registerAndEnrollUser(caClientCCP2, walletOrg2, "Org2MSP", org2UserId, 'org2.department1');

  } catch (error) {
    console.error(`******** FAILED to run the application: ${error}`);
  }
}

init().then(() => {

  app.listen(1234, async function () {

    console.log("Listening on port 1234");
  });

  app.get('/api/init', async (req, res) => {

    const gateway = new Gateway();

    // setup gateway
    // Người dùng giờ có thể kết nối tới mạng lưới fabric và giờ có thể truy vấn dữ liệu hoặc
    // thực hiện giao dịch thông qua chaincode (hợp đồng thông minh)
    // những giao dịch được thực hiện ở gateway này sẽ được ký bằng chữ ký người dùng được lưu trong ví   
    await gateway.connect(ccp, {
      wallet,
      identity: org1UserId,
      discovery: { enabled: true, asLocalhost: true }
    });

    // Build a network instance based on the channel where the smart contract is deployed
    const network = await gateway.getNetwork(channelName);

    // Get the contract from the network.
    const contract = network.getContract(chaincodeName, contractName);

    console.log('\n--> Submit Transaction: InitLedger, function creates the initial set of assets on the ledger');
    let result = await contract.submitTransaction('InitLedger');
    console.log('*** Result: committed');
    logResult(prettyJSONString(result.toString()));

    gateway.disconnect();

    return res.send("khoi tao thanh cong");
  })

  app.get('/api/all', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log('\n--> Evaluate Transaction: GetAllAssets, function returns all the current assets on the ledger');
      let result = await contract.evaluateTransaction('GetAllAssets');
      logResultcompleted();

      res.json(JSON.parse(result.toString()));
    } finally {
      gateway.disconnect();
    }
  })

  app.get('/api/read/:id', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      try {
        console.log('\n--> Evaluate Transaction: ReadAsset, function returns an asset with a given assetID');
        const result = await contract.evaluateTransaction('ReadAsset', req.params.id);
        logResultcompleted();
        return res.json(JSON.parse(result.toString()));
      }
      catch {
        logResultFailed();
        return res.status(404).send(`Asset '${req.params.id}' khong ton tai`)
      }

    } finally {
      gateway.disconnect();
    }
  });

  app.post('/api/create', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      // Giao dich se duoc gui cho cac peer, neu ca hai peer deu dong thuan giao dich nay, 
      // Giao dich se duoc dua den cho orderer de dua vao so cai cua kenh  
      console.log('\n--> Submit Transaction: CreateAsset');

      if (!req.body.Owner) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co Owner`);
      }

      try {
        var result = await contract.submitTransaction('CreateAsset', JSON.stringify(req.body));
        logResultCommited();

        if (`${result}` !== '')
          logResult(prettyJSONString(result.toString()));

        return res.send(JSON.stringify({
          msg: `Thanh cong: ma asset la ${JSON.parse(result).ID}`,
          ID: JSON.parse(result).ID,
        }));
      }
      catch
      {
        return res.status(404).send(`That bai: ID '${req.body.ID}' da ton tai`);
      }
    } finally {
      gateway.disconnect();
    }
  });

  app.post('/api/delete', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log('\n--> Submit Transaction: RemoveAsset');
      if (!req.body.ID) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co ID`);
      }

      try {
        var result = await contract.submitTransaction('DeleteAsset', req.body.ID);
        logResultCommited();
        logResult(result);

        return res.send(`Thanh cong: asset '${req.body.ID}' da duoc xoa khoi ledger`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Xoa that bai: asset '${req.body.ID}' khong ton tai`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  app.post('/api/update', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log('\n--> Submit Transaction: UpdateAsset');

      if (!req.body.ID) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co ID`);
      }

      if (!req.body.Owner) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co Owner`);
      }

      try {
        await contract.submitTransaction('UpdateAsset', JSON.stringify(req.body));
        logResultCommited();

        return res.send(`Thanh cong: asset '${req.body.ID}' da duoc cap nhat`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Cap nhat that bai: asset '${req.body.ID}' khong ton tai`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  //Cho phep chuyen chu so huu cua asset 
  // input: { ID, newOwner }
  app.post('/api/transfer', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log('\n--> Submit Transaction: TransferAsset');

      if (!req.body.ID) {
        logResultFailed();
        return res.status(404).send(`That bai: thieu ID cua asset`);
      }

      if (!req.body.newOwner) {
        logResultFailed();
        return res.status(404).send(`That bai: thieu newOwner (chu so huu moi cua asset)`);
      }

      try {
        const result = await contract.submitTransaction('ReadAsset', req.body.ID);
        const oldAsset = JSON.parse(result);

        await contract.submitTransaction('TransferAsset', req.body.ID, req.body.newOwner);
        logResultCommited();

        return res.send(`Thanh cong: da doi chu asset '${req.body.ID}' tu '${oldAsset.Owner}' sang '${req.body.newOwner}'`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Cap nhat that bai: asset '${req.body.ID}' khong ton tai`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  //Cho phep nguoi dung goi transaction cua smart contract mong muon 
  // input: {
  //   user: { org, ID }
  //   transaction: {channelName, chaincodeName, contractName, transactionName, args: [...]} }
  app.post('/api/call', async (req, res) => {
    let customCCP;
    let customWallet;

    if (req.body.user.org == "org1") {
      customCCP = ccp;
      customWallet = wallet;
    }

    else if (req.body.user.org == "org2") {
      customCCP = ccpOrg2;
      customWallet = walletOrg2;
    }

    else {
      return res.status(404).send(`to chuc ${req.body.user.org} khong ton tai`);
    }

    const gateway = new Gateway();
    try {
      await gateway.connect(customCCP, {
        wallet: customWallet,
        identity: req.body.user.ID,
        discovery: { enabled: true, asLocalhost: true }
      });

      const { channelName, chaincodeName, contractName, transactionName, args } = req.body.transaction;
      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log(`\n--> From channel '${channelName}', contract '${contractName}', Call Transaction: ${transactionName}`);
      try {
        const formatedArgs = args.map(arg => (typeof arg === 'object') ? JSON.stringify(arg) : arg);
        const result = await contract.submitTransaction(transactionName, ...formatedArgs);
        logResultcompleted();
        return res.send(result.toString());
      }
      catch {
        logResultFailed();
        res.status(404).send(`Goi that bai`);
      }
    } finally {
      gateway.disconnect();
    }
  });


  app.get('/api/history/:id', async (req, res) => {
    const gateway = new Gateway();
    try {
      await gateway.connect(ccp, {
        wallet,
        identity: org1UserId,
        discovery: { enabled: true, asLocalhost: true }
      });

      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, "AssetHistoryContract");

      try {
        console.log('\n--> Evaluate Transaction: GetHistory, function returns asset history with a given assetID');
        const result = await contract.evaluateTransaction('GetHistory', req.params.id);
        logResultcompleted();
        return res.json(JSON.parse(result.toString()));
      }
      catch {
        logResultFailed();
        return res.status(404).send(`Asset voi id ${req.params.id} khong ton tai`)
      }

    } finally {
      gateway.disconnect();
    }
  })
});

function logResultFailed() {
  console.log('*** Result: failed');
}

function logResultCommited() {
  console.log('*** Result: committed');
}

function logResultcompleted() {
  console.log('*** Result: completed');
}

function logResult(result) {
  console.log(`*** Result: ${result}`);
}
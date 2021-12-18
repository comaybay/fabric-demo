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
const chaincodeName = 'basic';
const contractName = "AssetTransferContract";

let msp = 'Org1MSP';
let walletPath = path.join(__dirname, 'wallet');
let org1UserId = 'David';
let affiliation = 'org1.department1';

const walletPathOrg2 = path.join(__dirname, 'walletOrg2');
const org2UserId = 'Max';
let affiliationOrg2 = 'org2.department1';
const mspOrg2 = "Org2MSP";

let ccp = null;
let wallet = null;
let caClient = null;

let walletOrg2 = null;
let ccpOrg2 = null;
let caClientOrg2 = null;

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

    await enrollAdmin(caClient, wallet, msp);
    await registerAndEnrollUser(caClient, wallet, msp, org1UserId, affiliation);

    walletOrg2 = await buildWallet(Wallets, walletPathOrg2);
    ccpOrg2 = buildCCPOrg2();
    caClientOrg2 = buildCAClient(FabricCAServices, ccpOrg2, 'ca.org2.example.com');
    await enrollAdmin(caClientOrg2, walletOrg2, mspOrg2);
    await registerAndEnrollUser(caClientOrg2, walletOrg2, mspOrg2, org2UserId, affiliationOrg2);

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
      let sortedResult = JSON.parse(result.toString()).sort((a, b) =>  parseInt(a.id.match(/asset(\d+)/)[1]) - parseInt(b.id.match(/asset(\d+)/)[1]));
      res.json(sortedResult);
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

      if (!req.body.name) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co name`);
      }

      try {
        var result = await contract.submitTransaction('CreateAsset', JSON.stringify(req.body));
        logResultCommited();

        if (`${result}` !== '')
          logResult(prettyJSONString(result.toString()));

        return res.json({
          msg: `Thanh cong: ma asset la ${JSON.parse(result).id}`,
          id: JSON.parse(result).id,
        });
      }
      catch
      {
        return res.status(404).send(`That bai: asset id '${req.body.id}' da ton tai`);
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

      if (!req.body.id) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co id`);
      }

      if (!req.body.name) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co name`);
      }

      try {
        await contract.submitTransaction('UpdateAsset', JSON.stringify(req.body));
        logResultCommited();

        return res.send(`Thanh cong: asset '${req.body.id}' da duoc cap nhat`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Cap nhat that bai: asset '${req.body.id}' khong ton tai hoac ban khong phai la chu so huu asset`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  // body: { id }
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
      if (!req.body.id) {
        logResultFailed();
        return res.status(404).send(`That bai: asset bat buoc phai co id`);
      }

      try {
        const result = await contract.submitTransaction('DeleteAsset', req.body.id);
        logResultCommited();

        return res.send(`Thanh cong: asset '${req.body.id}' da duoc xoa khoi ledger\n txId: ${JSON.parse(result).txId}`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Xoa that bai: asset '${req.body.id}' khong ton tai`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  //Cho phep chuyen chu so huu cua asset 
  // body: { id, newOwnerId }
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

      if (!req.body.id) {
        logResultFailed();
        return res.status(404).send(`That bai: thieu id cua asset`);
      }

      if (!req.body.newOwnerId) {
        logResultFailed();
        return res.status(404).send(`That bai: thieu newOwner (chu so huu moi cua asset)`);
      }

      try {
        const result = await contract.evaluateTransaction('ReadAsset', req.body.id);
        const oldAsset = JSON.parse(result);

        await contract.submitTransaction('TransferAsset', req.body.id, req.body.newOwnerId);
        logResultCommited();

        let newOwnerName = req.body.newOwnerId.match(/CN=(.*)::/)[1];
        return res.send(`Thanh cong: da doi chu asset '${req.body.id}' tu '${oldAsset.owner}' sang '${newOwnerName}'`);
      }
      catch {
        logResultFailed();
        res.status(404).send(`Cap nhat that bai: asset '${req.body.id}' khong ton tai hoac ban khong phai la chu so huu asset`);
      }

    } finally {
      gateway.disconnect();
    }
  });

  //Cho phep nguoi dung goi transaction cua smart contract mong muon 
  // input: {
  //   user: { org, department, name, affiliation}
  //   transaction: {channelName, chaincodeName, contractName, transactionName, args: [...]} }
  app.post('/api/call', async (req, res) => {
    let customCCP;
    let customWallet;
    let customCA;
    let customMSP;

    if (req.body.user.org == "org1") {
      customCA = caClient;
      customCCP = ccp;
      customWallet = wallet;
      customMSP = msp;
    }

    else if (req.body.user.org == "org2") {
      customCA = caClientOrg2;
      customCCP = ccpOrg2;
      customWallet = walletOrg2;
      customMSP = mspOrg2;
    }

    else {
      return res.status(404).send(`to chuc ${req.body.user.org} khong ton tai`);
    }

    await registerAndEnrollUser(customCA, customWallet, customMSP, req.body.user.name, req.body.user.affiliation);

    const gateway = new Gateway();
    try {
      await gateway.connect(customCCP, {
        wallet: customWallet,
        identity: req.body.user.name,
        discovery: { enabled: true, asLocalhost: true }
      });

      const { channelName, chaincodeName, contractName, transactionName, args } = req.body.transaction;
      const network = await gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName, contractName);

      console.log(`\n--> From org '${req.body.user.org}', user '${req.body.user.name}', affliation: '${req.body.user.affiliation}'`);
      console.log(`\n--> From channel '${channelName}', contract '${contractName}', Call Transaction: ${transactionName}`);
      try {
        const formatedArgs = args.map(arg => (typeof arg === 'object') ? JSON.stringify(arg) : arg);
        const result = await contract.submitTransaction(transactionName, ...formatedArgs);
        logResultcompleted();

        if (result.toString() != '') {
          logResult(prettyJSONString(result.toString()));
          return res.json(JSON.parse(result.toString()));
        }
        else
          return res.send("Goi thanh cong");
      }
      catch {
        logResultFailed();
        res.status(404).send(`Goi that bai`);
      }
    } finally {
      gateway.disconnect();
    }
  });

  //Xem lich su giao dich cua asset
  app.get('/api/txHistory/:id', async (req, res) => {
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

  //Xem thong tin giao dich dua tren ma giao dich (txId)
  app.get('/api/tx/:txId', async (req, res) => {
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
        console.log('\n--> Evaluate Transaction: GetHistory, function returns transaction info with a given txId');
        const result = await contract.evaluateTransaction('GetTransactionInfoByTxId', req.params.txId);
        logResultcompleted();
        return res.json(JSON.parse(result.toString()));
      }
      catch {
        logResultFailed();
        return res.status(404).send(`transsaction voi id ${req.params.txId} khong ton tai`)
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
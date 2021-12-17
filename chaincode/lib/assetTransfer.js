/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// Deterministic JSON.stringify()
const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract, Context } = require('fabric-contract-api');

class AssetTransferContext extends Context {

    constructor() {
        super();
        this.prefix = "asset";
    }

}

class AssetTransfer extends Contract {
    constructor() {
        super('AssetTransferContract');
        this.IDCount = 1;
    }

    createContext() {
        return new AssetTransferContext();
    }

    async InitLedger(ctx) {
        const ownerId = ctx.clientIdentity.getID();

        const assets = [
            {
                name: 'Đàn Ukulele Soprano',
                owner: ctx.clientIdentity.getID().match(/CN=(.*)::/)[1],
                ownerId,
                price: '549000',
                color: 'Nâu'
            },
            {
                name: 'Máy phát điện biogas',
                owner: 'Nguyễn Văn An',
                ownerId: "x509::/OU=org1/OU=client/OU=department1/CN=Nguyễn Văn An::/C=US/ST=North Carolina/L=Durham/O=org1.example.com/CN=ca.org1.example.com",
                price: '200000000',
                countryOfOrigin: 'Việt Nam',
                efficiency: '10kW-500kW (12 kVA-625 kVA)',
                capacity: '500ml'
            },
            {
                name: 'Sofa Da OEM',
                owner: 'See Jun',
                ownerId: "x509::/OU=org2/OU=client/OU=department1/CN=See Jun::/C=UK/ST=Hampshire/L=Hursley/O=org2.example.com/CN=ca.org2.example.com",
                price: '549000',
                brand: 'OEM',
                materials: 'Gỗ  Beech tự nhiên, Da bò Ý, Sơn Sherwin',
                weight: "100",
            },
            {
                name: 'iPhone 13',
                owner: 'Max',
                ownerId: "x509::/OU=org1/OU=client/OU=department1/CN=Max::/C=US/ST=North Carolina/L=Durham/O=org1.example.com/CN=ca.org1.example.com",
                price: '22890000',
                brand: 'Apple',
                color: 'Starlight',
                size: '146,7 x 71,5 x 7,65mm',
            },
            {
                name: 'Đàn Piano điện Yamaha CVP-705',
                owner: ctx.clientIdentity.getID().match(/CN=(.*)::/)[1],
                ownerId,
                price: '102000000',
                model: 'Yamaha CVP-705 - CVP-705PE',
                brand: 'Yamaha',
                materials: 'Gỗ cao cấp',
                countryOfOrigin: 'Nhật Bản',
                weight: '77,4',
            },
            {
                name: 'Biệt thự Galleria',
                owner: 'Nguyễn Văn A',
                ownerId: "x509::/OU=org2/OU=client/OU=department1/CN=Nguyễn Văn A:/C=UK/ST=Hampshire/L=Hursley/O=org2.example.com/CN=ca.org2.example.com",
                price: '42000000000',
                desciption: 'Kết cấu 5 tầng gồm 4 phòng ngủ và 5 toilet, cửa hướng Đông Nam thoáng mát, đây là một khu phố nhà ở kết hợp thương mại theo mô hình sang trọng, an ninh và văn minh. Nơi đây, bạn sẽ có cảm giác như lạc vào những con phố miền Nam Châu Âu với những cửa hiệu kén khách.',
                area: '342.7',
                address: 'Nguyễn Hữu Thọ, Phước Kiển, Nhà Bè, Hồ Chí Minh',
                ownershipType: 'Sổ hồng'
            },
        ];

        assets.forEach(a => a.id = ctx.prefix + this.IDCount++);

        for (const asset of assets) {
            // example of how to write to world state deterministically
            // use convetion of alphabetic order
            // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
            // when retrieving data, in any lang, the order of data will be the same and consequently also the corresonding hash
            await ctx.stub.putState(asset.id, Buffer.from(stringify(sortKeysRecursive(asset))));
        }

        await this._PutTransactionInfo(ctx);
        return JSON.stringify(assets);
    }

    async CreateAsset(ctx, assetString) {
        const asset = JSON.parse(assetString);

        if (asset.id) {
            const exists = await this.AssetExists(ctx, asset.id);

            if (exists)
                throw new Error(`The asset ${asset.id} already exists`);
        }
        else {
            while (true) {
                const newId = ctx.prefix + this.IDCount++;
                const exists = await this.AssetExists(ctx, newId);

                if (exists)
                    continue;

                asset.id = newId;
                break;
            }
        }

        asset.owner = ctx.clientIdentity.getID().match(/CN=(.*)::/)[1];
        asset.ownerId = ctx.clientIdentity.getID();
        await this._PutTransactionInfo(ctx);
        await ctx.stub.putState(asset.id, Buffer.from(stringify(sortKeysRecursive(asset))));
        return JSON.stringify(asset);
    }

    async ReadAsset(ctx, id) {
        const assetJSON = await ctx.stub.getState(id); // get the asset from chaincode state
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The asset ${id} does not exist`);
        }
        return assetJSON.toString();
    }

    async UpdateAsset(ctx, assetString) {
        const asset = JSON.parse(assetString);
        const exists = await this.AssetExists(ctx, asset.id);
        if (!exists) {
            throw new Error(`The asset ${asset.id} does not exist`);
        }

        const oldAsset = JSON.parse(await ctx.stub.getState(asset.id));

        let clientName = ctx.clientIdentity.getID().match(/CN=(.*)::/)[1];
        const clientId = ctx.clientIdentity.getID();
        if (oldAsset.ownerId != clientId) {
            throw new Error(`${clientName} is not the owner of this asset\n owner id: ${clientId}`);
        }

        asset.owner = oldAsset.owner; 
        asset.ownerId = oldAsset.ownerId; 

        // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
        await this._PutTransactionInfo(ctx);
        await ctx.stub.putState(asset.id, Buffer.from(stringify(sortKeysRecursive(asset))));
    }

    async DeleteAsset(ctx, id) {
        const exists = await this.AssetExists(ctx, id);
        if (!exists) {
            throw new Error(`The asset ${id} does not exist`);
        }

        const oldAsset = JSON.parse(await ctx.stub.getState(id));

        let clientName = ctx.clientIdentity.getID().match(/CN=(.*)::/)[1];
        const clientId = ctx.clientIdentity.getID();
        if (oldAsset.ownerId != clientId) {
            throw new Error(`${clientName} is not the owner of this asset\n owner id: ${clientId}`);
        }

        await this._PutTransactionInfo(ctx, true);
        let result = JSON.stringify({ txId: ctx.stub.getTxID() });
        await ctx.stub.deleteState(id);
        return result;
    }

    async AssetExists(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        return assetJSON && assetJSON.length > 0;
    }

    async TransferAsset(ctx, id, newOwnerId) {
        const asset = JSON.parse(await ctx.stub.getState(id));

        let clientName = ctx.clientIdentity.getID().match(/CN=(.*)::/)[1];
        const clientId = ctx.clientIdentity.getID();
        if (asset.ownerId != clientId) {
            throw new Error(`${clientName} is not the owner of this asset\n owner id: ${clientId}`);
        }

        asset.owner = newOwnerId.match(/CN=(.*)::/)[1];
        asset.ownerId = newOwnerId;
        await this._PutTransactionInfo(ctx);
        return ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(asset))));
    }

    async GetAllAssets(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }

            if (record && record.txId)
                continue;

            allResults.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }

    async _PutTransactionInfo(ctx, deleted = false) {
        const timestamp = ctx.stub.getTxTimestamp();
        const info = {
            txId: ctx.stub.getTxID(),
            txTimeStamp: (timestamp.seconds.low + ((timestamp.nanos / 1000000) / 1000)) * 1000,
            channelId: ctx.stub.getChannelID(),
            creatorId: ctx.clientIdentity.getID(),
            creatorMspId: ctx.clientIdentity.getMSPID(),
            deleted
        }
        const key = ctx.stub.createCompositeKey("string", ["tx", info.txId]);
        await ctx.stub.putState(key, Buffer.from(stringify(sortKeysRecursive(info))));
    }
}

module.exports = AssetTransfer;

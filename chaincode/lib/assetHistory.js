'use strict';

const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract, Context } = require('fabric-contract-api');

class AssetHistory extends Contract {
    constructor() {
        super('AssetHistoryContract');
    }

    async GetHistory(ctx, id) {
        let iterator = await ctx.stub.getHistoryForKey(id);
        let result = [];
        let res = await iterator.next();
        while (!res.done) {
          if (res.value) {
              const obj = JSON.parse(res.value.value.toString('utf8'));
              const timestamp  = res.value.timestamp;
            result.push({
                transaction: {
                    txId: res.value.txId,
                    timestamp: (timestamp.seconds.low + ((timestamp.nanos / 1000000) / 1000)) * 1000,
                    isDelete: res.value.isDelete.toString(),
                },
                value: obj
            });
          }
          res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(result);  
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
            allResults.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }
}

module.exports = AssetHistory;

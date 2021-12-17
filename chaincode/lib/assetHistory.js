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

                const key = ctx.stub.createCompositeKey("string", ["tx", res.value.txId]);
                let transaction = JSON.parse(await ctx.stub.getState(key));

                result.push({
                    transaction: transaction,
                    value: obj
                });
            }
            res = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(result);
    }

    async GetTransactionInfoByTxId(ctx, txId) {
        const key = ctx.stub.createCompositeKey("string", ["tx", txId]);
        const transaction = await ctx.stub.getState(key);

        if (transaction && transaction.length > 0)
            return transaction.toString();
        else
            throw new Error(`The transaction id '${id}' does not exist`);
    }
}

module.exports = AssetHistory;

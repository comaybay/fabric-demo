/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const assetTransferContract = require('./lib/assetTransfer');
const assetHistoryContract = require('./lib/assetHistory');

module.exports.AssetTransferContract = assetTransferContract;
module.exports.AssetHistoryContract = assetHistoryContract;

module.exports.contracts = [assetTransferContract, assetHistoryContract];

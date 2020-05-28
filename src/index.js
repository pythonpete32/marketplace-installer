const {encodeCallScript} = require('@aragon/test-helpers/evmScript');
const {encodeActCall, execAppMethod} = require('@aragon/toolkit');
const ethers = require('ethers');
const utils = require('ethers/utils');
const {keccak256} = require('web3-utils');

const {RLP} = utils;
const provider = ethers.getDefaultProvider('rinkeby');
const BN = utils.bigNumberify;
const env = 'rinkeby';


const Apps = require('../rinkebyApps.json');
const {counterfactualAddress} = require('./helpers')

// vars
const durationBlocks = 500
const bufferBlocks = 100
const executionPeriod = bufferBlocks / 2;
const executionDelayBlocks = 200
const rinkebyDAI = '0x0527e400502d0cb4f214dd0d2f2a323fc88ff924';
const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'

// DAO addresses
const dao = '0x8869c5F0d8306A6E06750f4C4230AdaA5b8CEB0E';
const acl = '0xd48adc963795067c85d31e6f5b978fafc2de08e1';
const tokens = '0x98e4a2b83ab382dcfc20a8963446a543f2efcde1';
const agent = '0x9a749778053e934c37013594a02a1a22f737effc';
const finance = '0xd2f362743c077b3ec7f44df6b90f4b86f32fee6e';
const voting = '0x6031b5d2b02ecdf2d6d08919b553d3d4cffee426';
const votingToken = '0xf50E4E580F22FD12C898963776FA4d7eB3FFe42F';


// new apps
let reserve
let marketplace
let marketMaker
let presale
let tap

// signatures
const newAppInstanceSignature = 'newAppInstance(bytes32,address,bytes,bool)';
const newAppInstanceNonInitSignature = 'newAppInstance(bytes32,address)'
const createPermissionSignature = 'createPermission(address,address,bytes32,address)';
const grantPermissionSignature = 'grantPermission(address,address,bytes32)';
const revokePermissionSignature = 'revokePermission(address,address,bytes32)';

// functions for counterfactual addresses
async function buildNonceForAddress(_address, _index, _provider) {
    const txCount = await _provider.getTransactionCount(_address);
    return `0x${(txCount + _index).toString(16)}`;
}

async function calculateNewProxyAddress(_daoAddress, _nonce) {
    const rlpEncoded = RLP.encode([_daoAddress, _nonce]);
    const contractAddressLong = keccak256(rlpEncoded);
    const contractAddress = `0x${contractAddressLong.substr(-40)}`;

    return contractAddress;
}

async function firstTx() {
    // counterfactual addresses
/*
    reserve = await counterfactualAddress(0, dao, provider);
    marketplace = await counterfactualAddress(1, dao, provider);
    marketMaker = await counterfactualAddress(2, dao, provider);
    presale = await counterfactualAddress(3, dao, provider);
    tap = await counterfactualAddress(4, dao, provider);
*/

    const nonce0 = await buildNonceForAddress(dao, 0, provider)
    reserve = await calculateNewProxyAddress(dao, nonce0)
    const nonce1 = await buildNonceForAddress(dao, 1, provider)
    marketplace = await calculateNewProxyAddress(dao, nonce1)
    const nonce2 = await buildNonceForAddress(dao, 2, provider)
    marketMaker = await calculateNewProxyAddress(dao, nonce2)
    const nonce3 = await buildNonceForAddress(dao, 3, provider)
    presale = await calculateNewProxyAddress(dao, nonce3)
    const nonce4 = await buildNonceForAddress(dao, 4, provider)
    tap = await calculateNewProxyAddress(dao, nonce4)
    // app initialisation payloads
    const agentInitPayload = encodeActCall(Apps.agent.signatures[0]);

    // package first transaction
    const calldatum = await Promise.all([
        encodeActCall(newAppInstanceSignature, [
            Apps.agent.appId,
            Apps.agent.contractAddress,
            agentInitPayload,
            true,
        ]),
        encodeActCall(newAppInstanceNonInitSignature, [
            Apps.marketplace.appId,
            Apps.marketplace.contractAddress,
        ]),
        encodeActCall(newAppInstanceNonInitSignature, [
            Apps.marketMaker.appId,
            Apps.marketMaker.contractAddress,
        ]),
        encodeActCall(newAppInstanceNonInitSignature, [
            Apps.tap.appId,
            Apps.tap.contractAddress,
        ]),
        encodeActCall(newAppInstanceNonInitSignature, [
            Apps.presale.appId,
            Apps.presale.contractAddress,
        ]),
        encodeActCall(Apps.presale.signatures[0], [
            marketplace,
            tokens,
            reserve,
            agent,
            rinkebyDAI,
            BN('100000000000000000000'),
            604800,
            1,
            2592000,
            7776000,
            900000,
            250000,
            0,
        ]),
        encodeActCall(Apps.tap.signatures[0], [
            marketplace,
            reserve,
            agent,
            1,
            BN('1000000000000000000'),
            BN('1000000000000000000'),
        ]),
        encodeActCall(Apps.marketMaker.signatures[0], [
            marketplace,
            tokens,
            Apps.bancorFormula.contractAddress,
            reserve,
            agent,
            1,
            BN('100000000000000000'),
            BN('100000000000000000'),
        ]),
    ]);

    const actions = [
        {
            to: dao,
            calldata: calldatum[0],
        },
        {
            to: dao,
            calldata: calldatum[1],
        },
        {
            to: dao,
            calldata: calldatum[2],
        },
        {
            to: dao,
            calldata: calldatum[3],
        },
        {
            to: dao,
            calldata: calldatum[4],
        },
        {
            to: presale,
            calldata: calldatum[5],
        },
        {
            to: tap,
            calldata: calldatum[6],
        },
        {
            to: marketMaker,
            calldata: calldatum[7],
        },
    ];
    const script = encodeCallScript(actions);

    await execAppMethod(
        dao,
        voting,
        'newVote',
        [
            script,
            `
            1. install voting aggregator
            2. install dot voting
            `,
        ],
        env,
    );
}

async function secondTx() {

    // package first transaction
    const calldatum = await Promise.all([
        encodeActCall(Apps.presale.signatures[0], [
            marketplace,
            tokens,
            reserve,
            agent,
            rinkebyDAI,
            BN('100000000000000000000'),
            604800,
            1,
            2592000,
            7776000,
            900000,
            250000,
            0,
        ]),
    ]);

    const actions = [
        {
            to: presale,
            calldata: calldatum[0],
        },
    ];
    const script = encodeCallScript(actions);

    await execAppMethod(
        dao,
        voting,
        'newVote',
        [
            script,
            `
            1. install voting aggregator
            2. install dot voting
            `,
        ],
        env,
    );
}

const main = async () => {
    console.log('Generationg first vote');
    await firstTx();
    console.log('Generating second vote');
    await secondTx();
};

main()
    .then(() => {
        console.log('Script finished.');
        process.exit();
    })
    .catch((e) => {
        console.error(e);
        process.exit();
    });

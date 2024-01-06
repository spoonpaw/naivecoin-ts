import express, {ErrorRequestHandler} from 'express';
import bodyParser from 'body-parser';
import {
    Block, generateNextBlock,
    generatenextBlockWithTransaction,
    generateRawNextBlock, getAccountBalance,
    getBlockchain,
    getMyUnspentTransactionOutputs, getUnspentTxOuts, sendTransaction
} from "./blockchain";
import {connectToPeers, getSockets, initP2PServer, isExtendedWebSocket} from "./p2p";
import {getPublicFromWallet, initWallet} from './wallet';
import {getTransactionPool} from "./transactionPool";

const httpPort: number = parseInt(process.env.HTTP_PORT ?? "3001");
const p2pPort: number = parseInt(process.env.P2P_PORT ?? "6001");

const initHttpServer = (myHttpPort: number) => {
    const app = express();
    app.use(bodyParser.json());

    const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
        if (err) {
            res.status(400).send(err.message);
        } else {
            next();
        }
    };

    app.use(errorHandler);

    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });

    app.get('/unspentTransactionOutputs', (req, res) => {
        res.send(getUnspentTxOuts());
    });

    app.get('/myUnspentTransactionOutputs', (req, res) => {
        res.send(getMyUnspentTransactionOutputs());
    });

    app.post('/mineRawBlock', (req, res) => {
        if (req.body.data == null) {
            res.send('data parameter is missing');
            return;
        }
        const newBlock: Block | null = generateRawNextBlock(req.body.data);
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });


    app.post('/mineBlock', (req, res) => {
        const newBlock: Block | null = generateNextBlock();
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });

    app.get('/balance', (req, res) => {
        const balance: number = getAccountBalance();
        res.send({'balance': balance});
    });

    app.get('/address', (req, res) => {
        const address: string = getPublicFromWallet();
        res.send({'address': address});
    });
    app.get('/peers', (req, res) => {
        const peers = getSockets().map((s) => {
            if (isExtendedWebSocket(s)) {
                return `${s._socket.remoteAddress}:${s._socket.remotePort}`;
            } else {
                return 'Unknown Peer';
            }
        });
        res.send(peers);
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers(req.body.peer);
        res.send();
    });

    app.post('/mineTransaction', (req, res) => {
        const address = req.body.address;
        const amount = req.body.amount;
        try {
            const resp = generatenextBlockWithTransaction(address, amount);
            res.send(resp);
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
                res.status(400).send(e.message);
            } else {
                // Handle the case where e is not an Error instance
                res.status(400).send('An error occurred');
            }
        }
    });

    app.post('/sendTransaction', (req, res) => {
        try {
            const address = req.body.address;
            const amount = req.body.amount;

            if (address === undefined || amount === undefined) {
                throw Error('invalid address or amount');
            }
            const resp = sendTransaction(address, amount);
            res.send(resp);
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
                res.status(400).send(e.message);
            } else {
                // Handle the case where e is not an Error instance
                res.status(400).send('An error occurred');
            }
        }
    });

    app.get('/transactionPool', (req, res) => {
        res.send(getTransactionPool());
    });

    app.post('/stop', (req, res) => {
        res.send({'msg': 'stopping server'});
        process.exit();
    });

    app.listen(myHttpPort, () => {
        console.log('Listening http on port: ' + myHttpPort);
    });
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
initWallet();

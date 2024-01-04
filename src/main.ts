import express from 'express';
import bodyParser from 'body-parser';
import {Block, generateNextBlock, getBlockchain} from "./blockchain";
import {connectToPeers, getSockets, initP2PServer, isExtendedWebSocket} from "./p2p";

const httpPort: number = parseInt(process.env.HTTP_PORT ?? "3001");
const p2pPort: number = parseInt(process.env.P2P_PORT ?? "6001");

const initHttpServer = ( myHttpPort: number ) => {
	const app = express();
	app.use(bodyParser.json());

	app.get('/blocks', (req, res) => {
		res.send(getBlockchain());
	});
	app.post('/mineBlock', (req, res) => {
		const newBlock: Block = generateNextBlock(req.body.data);
		res.send(newBlock);
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

	app.listen(myHttpPort, () => {
		console.log('Listening http on port: ' + myHttpPort);
	});
};

initHttpServer(httpPort);
initP2PServer(p2pPort);

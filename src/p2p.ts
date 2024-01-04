import WebSocket from 'ws';

import {Server} from 'ws';
import {addBlockToChain, Block, getBlockchain, getLatestBlock, isValidBlockStructure, replaceChain} from "./blockchain";

const sockets: WebSocket[] = [];

enum MessageType {
	QUERY_LATEST = 0,
	QUERY_ALL = 1,
	RESPONSE_BLOCKCHAIN = 2,
}

interface Message {
	type: MessageType;
	data: string | Block[] | null;
}

const initP2PServer = (p2pPort: number) => {
	const server: Server = new WebSocket.Server({port: p2pPort});
	server.on('connection', (ws: WebSocket) => {
		initConnection(ws);
	});
	console.log('listening websocket p2p port on: ' + p2pPort);
};

const getSockets = () => sockets;

const initConnection = (ws: WebSocket) => {
	sockets.push(ws);
	initMessageHandler(ws);
	initErrorHandler(ws);
	write(ws, queryChainLengthMsg());
};

const JSONToObject = <T>(data: string): T | null => {
	try {
		return JSON.parse(data);
	} catch (e) {
		console.log(e);
		return null;
	}
};

const initMessageHandler = (ws: WebSocket) => {
	ws.on('message', (data: string) => {
		const message = JSONToObject<Message>(data);
		if (message === null) {
			console.log('could not parse received JSON message: ' + data);
			return;
		}
		console.log('Received message' + JSON.stringify(message));
		switch (message.type) {
			case MessageType.QUERY_LATEST: {
				write(ws, responseLatestMsg());
				break;
			}
			case MessageType.QUERY_ALL: {
				write(ws, responseChainMsg());
				break;
			}
			case MessageType.RESPONSE_BLOCKCHAIN: {
				if (typeof message.data === 'string') {
					const receivedBlocks = JSONToObject<Block[]>(message.data);
					if (receivedBlocks === null) {
						console.log('invalid blocks received:');
						console.log(message.data);
						break;
					}
					handleBlockchainResponse(receivedBlocks);
				} else {
					console.log('Invalid data type for RESPONSE_BLOCKCHAIN message');
				}
				break;
			}
		}
	});
};

const write = (ws: WebSocket, message: Message): void => ws.send(JSON.stringify(message));
const broadcast = (message: Message): void => sockets.forEach((socket) => write(socket, message));

const queryChainLengthMsg = (): Message => ({'type': MessageType.QUERY_LATEST, 'data': null});

const queryAllMsg = (): Message => ({'type': MessageType.QUERY_ALL, 'data': null});

const responseChainMsg = (): Message => ({
	'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

const responseLatestMsg = (): Message => ({
	'type': MessageType.RESPONSE_BLOCKCHAIN,
	'data': JSON.stringify([getLatestBlock()])
});

const initErrorHandler = (ws: WebSocket) => {
	const closeConnection = (myWs: WebSocket) => {
		console.log('connection failed to peer: ' + myWs.url);
		sockets.splice(sockets.indexOf(myWs), 1);
	};
	ws.on('close', () => closeConnection(ws));
	ws.on('error', () => closeConnection(ws));
};

const handleBlockchainResponse = (receivedBlocks: Block[]) => {
	if (receivedBlocks.length === 0) {
		console.log('received block chain size of 0');
		return;
	}
	const latestBlockReceived: Block = receivedBlocks[receivedBlocks.length - 1];
	if (!isValidBlockStructure(latestBlockReceived)) {
		console.log('block structure not valid');
		return;
	}
	const latestBlockHeld: Block = getLatestBlock();
	if (latestBlockReceived.index > latestBlockHeld.index) {
		console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
		if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
			if (addBlockToChain(latestBlockReceived)) {
				broadcast(responseLatestMsg());
			}
		} else if (receivedBlocks.length === 1) {
			console.log('We have to query the chain from our peer');
			broadcast(queryAllMsg());
		} else {
			console.log('Received blockchain is longer than current blockchain');
			replaceChain(receivedBlocks);
		}
	} else {
		console.log('received blockchain is not longer than current blockchain. Do nothing');
	}
};

const broadcastLatest = (): void => {
	broadcast(responseLatestMsg());
};

const connectToPeers = (newPeer: string): void => {
	const ws: WebSocket = new WebSocket(newPeer);
	ws.on('open', () => {
		initConnection(ws);
	});
	ws.on('error', () => {
		console.log('connection failed');
	});
};
// Define a type for the socket with the additional properties
interface ExtendedWebSocket extends WebSocket {
	_socket: {
		remoteAddress: string;
		remotePort: number;
	};
}

// Type guard to check if a WebSocket is an ExtendedWebSocket
function isExtendedWebSocket(ws: WebSocket): ws is ExtendedWebSocket {
	// Check if '_socket' exists and has the required properties
	const extendedWs = ws as ExtendedWebSocket;
	return (
		extendedWs._socket !== undefined &&
		'remoteAddress' in extendedWs._socket &&
		'remotePort' in extendedWs._socket
	);
}

export {connectToPeers, broadcastLatest, initP2PServer, getSockets, isExtendedWebSocket};

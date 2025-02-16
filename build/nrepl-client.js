import * as net from 'net';
import { BencodeDecoder, BencodeEncoder } from './bencode.js';
export class NReplClient {
    constructor(port) {
        this.buffer = '';
        this.messageCallbacks = new Map();
        this.sessionId = null;
        this.lastError = null;
        this.connected = false;
        this.port = port;
        this.socket = new net.Socket();
        this.setupSocketHandlers();
        this.connect();
    }
    setupSocketHandlers() {
        this.socket.on('data', (data) => this.handleData(data));
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.connected = false;
            this.lastError = error.message;
        });
        this.socket.on('close', () => {
            console.error('Socket closed');
            this.connected = false;
            if (!this.lastError) {
                this.lastError = 'Connection closed';
            }
        });
    }
    connect() {
        this.socket.connect(this.port, '127.0.0.1', () => {
            console.error('Connected to nREPL server');
            this.connected = true;
        });
    }
    async ensureConnected() {
        if (!this.connected) {
            this.socket.destroy();
            this.socket = new net.Socket();
            this.setupSocketHandlers();
            this.connect();
            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const error = new Error('Connection timeout');
                    this.lastError = error.message;
                    reject(error);
                }, 5000);
                this.socket.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
            // Re-clone session after reconnect
            await this.clone();
        }
    }
    handleData(data) {
        this.buffer += data.toString();
        console.error('Received data:', data.toString());
        // Try to process complete messages from the buffer
        let processed = 0;
        while (processed < this.buffer.length) {
            try {
                const decoder = new BencodeDecoder(this.buffer.slice(processed));
                const response = decoder.decode();
                console.error('Decoded response:', response);
                if (response.id) {
                    const callback = this.messageCallbacks.get(response.id);
                    if (callback) {
                        callback(response);
                        if (response.status?.includes('done')) {
                            this.messageCallbacks.delete(response.id);
                        }
                    }
                }
                // Update processed count based on what was actually decoded
                processed += decoder.getProcessedLength();
            }
            catch (error) {
                // If we can't decode, assume we need more data
                break;
            }
        }
        // Remove processed data from buffer
        if (processed > 0) {
            this.buffer = this.buffer.slice(processed);
        }
    }
    send(message) {
        return new Promise((resolve, reject) => {
            const responses = [];
            const id = Math.random().toString(36).slice(2);
            console.error('Sending message:', message);
            const timeout = setTimeout(() => {
                this.messageCallbacks.delete(id);
                const error = new Error(`nREPL request timed out. Message: ${JSON.stringify(message)}`);
                this.lastError = error.message;
                reject(error);
            }, 30000); // Increase timeout to 30 seconds
            this.messageCallbacks.set(id, (response) => {
                responses.push(response);
                if (response.status?.includes('done')) {
                    clearTimeout(timeout);
                    this.messageCallbacks.delete(id);
                    resolve(responses);
                }
            });
            try {
                const encoded = BencodeEncoder.encode({ ...message, id });
                console.error('Encoded message:', encoded);
                this.socket.write(encoded);
            }
            catch (error) {
                clearTimeout(timeout);
                this.messageCallbacks.delete(id);
                reject(error);
            }
        });
    }
    async clone() {
        const responses = await this.send({ op: 'clone' });
        const newSession = responses[0]['new-session'];
        if (!newSession) {
            throw new Error('Failed to create new session');
        }
        this.sessionId = newSession;
        return newSession;
    }
    async eval(code) {
        await this.ensureConnected();
        if (!this.sessionId) {
            throw new Error('No active session');
        }
        const responses = await this.send({
            op: 'eval',
            code,
            session: this.sessionId,
        });
        // Collect any errors
        const errors = responses
            .map((r) => r.ex || r['root-ex'] || r.err)
            .filter(Boolean);
        if (errors.length > 0) {
            const errorMsg = errors.join('\n');
            this.lastError = errorMsg;
            throw new Error(errorMsg);
        }
        // Collect any output
        const output = responses
            .map((r) => r.value || r.out)
            .filter(Boolean);
        return output.join('\n');
    }
    async close() {
        return new Promise((resolve) => {
            this.socket.end(() => resolve());
        });
    }
}

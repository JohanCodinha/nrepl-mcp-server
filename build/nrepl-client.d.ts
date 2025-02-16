import { BencodeValue } from './bencode.js';
export interface NReplMessage {
    op: string;
    id?: string;
    session?: string;
    code?: string;
    [key: string]: BencodeValue | undefined;
}
export interface NReplResponse {
    id: string;
    session?: string;
    value?: string;
    'new-session'?: string;
    status?: string[];
    ex?: string;
    'root-ex'?: string;
    out?: string;
    err?: string;
}
export declare class NReplClient {
    private socket;
    private buffer;
    private messageCallbacks;
    sessionId: string | null;
    lastError: string | null;
    private port;
    private connected;
    constructor(port: number);
    private setupSocketHandlers;
    private connect;
    private ensureConnected;
    private handleData;
    private send;
    clone(): Promise<string>;
    eval(code: string): Promise<string>;
    close(): Promise<void>;
}

/**
 * A minimal bencode implementation for nREPL communication.
 * Supports only the types needed: strings, integers, lists, and dictionaries.
 */
export type BencodeValue = string | number | BencodeValue[] | {
    [key: string]: BencodeValue;
};
export declare class BencodeEncoder {
    static encode(value: BencodeValue): string;
}
export declare class BencodeDecoder {
    private pos;
    private data;
    private startPos;
    constructor(data: string);
    getProcessedLength(): number;
    decode(): BencodeValue;
    private decodeInteger;
    private decodeString;
    private decodeList;
    private decodeDictionary;
    static decode(data: string): BencodeValue;
}

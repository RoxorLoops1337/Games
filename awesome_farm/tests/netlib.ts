// What the suites that spawn the real dedicated server share (server.e2e, server.hardening, reconnect, dev).
import { createServer, type AddressInfo } from 'node:net';

/**
 * A TCP port nobody is listening on: the OS hands one out (bind 0), we read its number and let it go, so suites running side
 * by side cannot pick the same one. (The server cannot be told port 0 itself: it prints the port it was asked for, not the one it got.)
 */
export const freePort = () => new Promise<number>((res, rej) => {
    const probe = createServer();
    probe.once('error', rej);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address() as AddressInfo; probe.close(() => res(port)); });
});

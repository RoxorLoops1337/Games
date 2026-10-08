// The solo connection the 3D view talks to.
import { type Peer, SimHost } from '../shared/net/host';
import { type ClientMsg, PROTOCOL, type ServerMsg } from '../shared/net/protocol';
import { Sim } from '../shared/sim/sim';
import type { Cmd, PlayerS } from '../shared/sim/types';

/** The 3D view's own solo connection: a SimHost on a fresh world in the page, spoken to in the real wire format. */
export class Local {
    id = 'me';
    inbox: ServerMsg[] = [];
    sim: Sim;
    host: SimHost;
    peer: Peer;
    /** `stage` runs on the new world before anybody is told about it (the showcase builds its farmstead there). */
    constructor(seed: string, name: string, stage?: (sim: Sim, p: PlayerS) => void) {
        this.sim = Sim.create(seed, 'lowpoly');
        this.sim.cheats = true;
        if (stage) {
            const p = this.sim.join(this.id, name);
            if (p) {
                stage(this.sim, p);
                this.sim.events.length = 0;
            }
        }
        this.host = new SimHost(this.sim, 'Low Poly', '', { devOpen: true });
        this.peer = { send: (text: string) => {
            this.inbox.push(JSON.parse(text) as ServerMsg);
        } };
        this.host.attach(this.peer);
        const hello: ClientMsg = { t: 'hello', v: PROTOCOL, id: this.id, name };
        this.host.receive(this.peer, JSON.stringify(hello));
    }
    send(c: Cmd) {
        const msg: ClientMsg = { t: 'cmd', c };
        this.host.receive(this.peer, JSON.stringify(msg));
    }
    /** Advance the world by dt seconds and hand over every message since the last call. */
    poll(dt: number): ServerMsg[] {
        this.host.update(dt);
        const m = this.inbox;
        this.inbox = [];
        return m;
    }
}

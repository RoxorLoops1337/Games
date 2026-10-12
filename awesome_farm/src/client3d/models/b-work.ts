// Every work building kind and its model maker.
import { BED } from './b-work-bed';
import { CRAFT } from './b-work-craft';
import { LOGI } from './b-work-logi';
import { IRIDIUM } from './b-iridium';
import { MISC } from './b-work-misc';
import { POWER } from './b-work-power';

export const WORK = {
    ...CRAFT,
    ...MISC,
    ...LOGI,
    ...POWER,
    ...IRIDIUM,
    ...BED
};

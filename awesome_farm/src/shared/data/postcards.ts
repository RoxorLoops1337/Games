// Postcards: every dawn one of the island folk (data/sidequests.ts GIVERS) sends each farmer a short card with a small present, to
// the mailbox. The words are written here; which card and which present is decided by the world's seed, the day and the farmer, so
// it is the same every time it is asked. Rules in sim/mail.ts.

export const POSTCARD_LINES: Record<string, string[]> = {
    marta: ['The beds look lovely from the path. Water them early and they will thank you.', 'I left a few seeds for you. Plant them somewhere the sun reaches all day.', 'Rain is good luck for a gardener. Do not forget your boots.'],
    odo: ['Passing through your waters soon. Keep a few spare goods by for me.', 'Prices are kind this week. A little something for your trouble.', 'A trader never forgets a good customer. Here is a coin or two.'],
    pip: ['My little friends send their love, and I send a treat for yours.', 'Have you pet your companion today? They like it more than they say.', 'I saw something small and furry near your shore. Be kind to it.'],
    brine: ['The sea is quiet this morning. Too quiet. Keep your lantern lit.', 'Forty years on these waters and the best fish still bite at dawn.', 'Mind the tide, farmer. It gives, and it takes back.'],
    ferro: ['Hammered this out last night and it came out better than I planned. Yours.', 'A good tool is half the work. Keep yours sharp.', 'Send me an iron bar and I will tell you a secret. Maybe.'],
    watcher: ['I watched the dark for you again last night. It passed.', 'Keep a fire burning. They do not like the light.', 'Something stirs beneath your island. Not tonight, I think.'],
    fortuna: ['The cards say a lucky day. They are rarely wrong, and sometimes kind.', 'Spin the wheel before dusk. I have a feeling.', 'Luck is a habit. Here is a little to start it.'],
    finn: ['Dug up an old map today. The X looked a lot like your island.', 'Treasure does not find itself. Take a shovel.', 'A bottle washed up with your name on it. Well, almost.'],
    rocco: ['The rock sang to me this morning. Come and listen.', 'Found some good stone and thought of you.', 'Deep down it is quiet and warm. You would like it.'],
};

/** What a postcard can carry: small coins, or a few of a kind of seed. */
export const POSTCARD_SEEDS = ['seed_wheat', 'seed_carrot', 'seed_pumpkin', 'seed_cotton', 'seed_beet', 'seed_corn'] as const;

/** Notes a friend can put in a parcel with one tap (they can also write their own). */
export const NOTE_PRESETS = ['Thank you!', 'For your farm.', 'Good luck tonight!', 'Happy harvest!', 'Look after this one.', 'Thinking of you.'];

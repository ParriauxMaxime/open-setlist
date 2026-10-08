// Memorable passphrases for encrypted invites, meant to be said out loud.
// 128 words per list (7 bits each) + a 2-digit number: ~27.5 bits per
// passphrase. Words are short and accent-free so they survive dictation.

const words = (list: string): readonly string[] => list.trim().split(/\s+/);

export const PASSPHRASE_WORDS = {
  en: words(`
    amber anchor apple arrow badge banjo basil beach bell berry bird blues boat brass bread
    brick bridge cactus camel candle canoe carpet castle cedar cello cherry chorus cloud
    clover cobalt comet copper coral cotton crane daisy delta desert dolphin dragon drum
    eagle echo ember falcon fern fiddle flute forest fox galaxy garden ginger glacier grape
    guitar harbor harp hazel honey island ivory jacket jasmine jungle kettle kiwi koala
    lagoon lantern lemon lily lion lizard lobster lotus lyric mango maple marble meadow
    melody meteor mint mirror monkey moon nectar needle night oasis ocean olive orange orbit
    otter owl panda paper parrot peach pepper piano pilot planet plum pocket puzzle quartz
    rabbit radio rain river rocket saddle salmon shadow silver sparrow spider summer tango
    tiger tulip velvet violin walnut zebra
  `),
  fr: words(`
    abeille abricot accord aigle album ananas ancre arbre argent avion baleine balcon bambou
    banane basse bateau biscuit bougie boussole bouton branche brioche cactus canard carotte
    castor cerise chanson chapeau charbon chat cheval chocolat citron citrouille clavier
    colibri concert corail coton coussin crayon cuivre cygne dauphin domino dragon falaise
    flamant flocon framboise fromage girafe glace gorille guitare hamac harpe hibou horizon
    jardin jasmin jungle kiwi lagune lanterne lapin lavande lion lotus loup lune mangue
    marmotte marron miroir mistral montagne mouton noisette nuage nuit olive orage orange
    orgue ours panda papillon parapluie pastel perroquet piano pinceau pirate plume poisson
    pomme potiron prairie puzzle radio raisin renard requin rivage robot rocher ruban sable
    sapin saumon serpent soleil sourire tambour tango tigre tomate tortue trompette tulipe
    valise velours violon volcan voyage wagon
  `),
};

export type PassphraseLocale = keyof typeof PASSPHRASE_WORDS;

export const MIN_PASSPHRASE_LENGTH = 8;
const PASSPHRASE_WORD_COUNT = 4;

/** Uniform random integer in [0, max) from the platform CSPRNG (rejection sampling). */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** e.g. "lune-tigre-piano-47". */
export function generatePassphrase(locale: PassphraseLocale = "en"): string {
  const words = PASSPHRASE_WORDS[locale];
  const picked = Array.from(
    { length: PASSPHRASE_WORD_COUNT },
    () => words[randomInt(words.length)],
  );
  return [...picked, String(10 + randomInt(90))].join("-");
}

/**
 * Passphrases are dictated, so case, accents and separators are ignored:
 * "Lune Tigre piano 47" and "lune-tigre-piano-47" unlock the same invite.
 */
export function normalizePassphrase(passphrase: string): string {
  return passphrase
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s\-_.,;:/]+/)
    .filter(Boolean)
    .join("-");
}

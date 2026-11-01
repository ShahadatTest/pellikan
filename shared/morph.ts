// Decoders for the morphology codes stored raw in the database.
//
//  * Greek: MorphGNT (part-of-speech code + 8-character parsing code).
//    Tables from the MorphGNT SBLGNT README.
//  * Hebrew/Aramaic: OSHM codes, e.g. "HR/Ncfsa". Tables from the Open Scriptures
//    "Hebrew Morphology Codes" page.
//
// The database keeps the raw codes (lossless); decoding happens at display time.

export interface DecodedMorph {
  pos: string
  features: string[]
  summary: string
}

export interface DecodedHebrewSegment extends DecodedMorph {
  code: string
}

export interface DecodedHebrew {
  language: 'Hebrew' | 'Aramaic'
  segments: DecodedHebrewSegment[]
  summary: string
}

const GREEK_POS: Record<string, string> = {
  'A-': 'adjective',
  'C-': 'conjunction',
  'D-': 'adverb',
  'I-': 'interjection',
  'N-': 'noun',
  'P-': 'preposition',
  RA: 'definite article',
  RD: 'demonstrative pronoun',
  RI: 'interrogative/indefinite pronoun',
  RP: 'personal pronoun',
  RR: 'relative pronoun',
  'V-': 'verb',
  'X-': 'particle',
}

// Parsing code positions: person, tense, voice, mood, case, number, gender, degree.
const G_PERSON: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' }
const G_TENSE: Record<string, string> = { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', X: 'perfect', Y: 'pluperfect' }
const G_VOICE: Record<string, string> = { A: 'active', M: 'middle', P: 'passive' }
const G_MOOD: Record<string, string> = { I: 'indicative', D: 'imperative', S: 'subjunctive', O: 'optative', N: 'infinitive', P: 'participle' }
const G_CASE: Record<string, string> = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative' }
const G_NUMBER: Record<string, string> = { S: 'singular', P: 'plural' }
const G_GENDER: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' }
const G_DEGREE: Record<string, string> = { C: 'comparative', S: 'superlative' }

export function decodeGreekMorph(pos: string, parse: string): DecodedMorph {
  const posName = GREEK_POS[pos] ?? pos
  const p = parse.padEnd(8, '-')
  const features = [
    G_TENSE[p[1]!],
    G_VOICE[p[2]!],
    G_MOOD[p[3]!],
    G_PERSON[p[0]!],
    G_CASE[p[4]!],
    G_NUMBER[p[5]!],
    G_GENDER[p[6]!],
    G_DEGREE[p[7]!],
  ].filter((x): x is string => Boolean(x))
  return { pos: posName, features, summary: [posName, ...features].join(', ') }
}

const H_STEM: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael', o: 'polel',
  O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal', Q: 'qal passive',
  l: 'pilpel', L: 'polpal', f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal',
  c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel',
}
const A_STEM: Record<string, string> = {
  q: 'peal', Q: 'peil', u: 'hithpeel', p: 'pael', P: 'ithpaal', M: 'hithpaal', a: 'aphel', h: 'haphel',
  s: 'saphel', e: 'shaphel', H: 'hophal', i: 'ithpeel', t: 'hishtaphel', v: 'ishtaphel', w: 'hithaphel',
  o: 'polel', z: 'ithpoel', r: 'hithpolel', f: 'hithpalpel', b: 'hephal', c: 'tiphel', m: 'poel',
  l: 'palpel', L: 'ithpalpel', O: 'ithpolel', G: 'ittaphal',
}
const H_VERB_TYPE: Record<string, string> = {
  p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect', h: 'cohortative',
  j: 'jussive', v: 'imperative', r: 'participle active', s: 'participle passive',
  a: 'infinitive absolute', c: 'infinitive construct',
}
const H_PERSON: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' }
const H_GENDER: Record<string, string> = { b: 'masculine or feminine', c: 'common', f: 'feminine', m: 'masculine' }
const H_NUMBER: Record<string, string> = { d: 'dual', p: 'plural', s: 'singular' }
const H_STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' }

const H_TYPES: Record<string, Record<string, string>> = {
  A: { a: 'adjective', c: 'cardinal number', g: 'gentilic', o: 'ordinal number' },
  N: { c: 'common', g: 'gentilic', p: 'proper name' },
  P: { d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative' },
  R: { d: 'with definite article' },
  S: { d: 'directional he', h: 'paragogic he', n: 'paragogic nun', p: 'pronominal' },
  T: { a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection', m: 'demonstrative', n: 'negative', o: 'direct object marker', r: 'relative' },
}
const H_POS: Record<string, string> = {
  A: 'adjective', C: 'conjunction', D: 'adverb', N: 'noun', P: 'pronoun',
  R: 'preposition', S: 'suffix', T: 'particle', V: 'verb',
}

function pick(table: Record<string, string>, ch: string | undefined): string | undefined {
  return ch && ch !== 'x' ? table[ch] : undefined
}

function decodeHebrewSegment(code: string, aramaic: boolean): DecodedHebrewSegment {
  const posCode = code[0] ?? ''
  const rest = code.slice(1)
  const posName = H_POS[posCode] ?? code
  const feats: Array<string | undefined> = []
  const typeTable = H_TYPES[posCode]

  switch (posCode) {
    case 'A':
    case 'N':
      feats.push(pick(typeTable!, rest[0]), pick(H_GENDER, rest[1]), pick(H_NUMBER, rest[2]), pick(H_STATE, rest[3]))
      break
    case 'P':
    case 'S':
      feats.push(pick(typeTable!, rest[0]), pick(H_PERSON, rest[1]), pick(H_GENDER, rest[2]), pick(H_NUMBER, rest[3]))
      break
    case 'R':
    case 'T':
      feats.push(pick(typeTable!, rest[0]))
      break
    case 'V': {
      const stem = pick(aramaic ? A_STEM : H_STEM, rest[0])
      const type = rest[1]
      feats.push(stem, pick(H_VERB_TYPE, type))
      if (type === 'r' || type === 's') {
        // Participles take gender, number, state (no person).
        feats.push(pick(H_GENDER, rest[2]), pick(H_NUMBER, rest[3]), pick(H_STATE, rest[4]))
      } else if (type !== 'a' && type !== 'c') {
        feats.push(pick(H_PERSON, rest[2]), pick(H_GENDER, rest[3]), pick(H_NUMBER, rest[4]))
      }
      break
    }
    default:
      break
  }
  const features = feats.filter((x): x is string => Boolean(x))
  return { code, pos: posName, features, summary: [posName, ...features].join(', ') }
}

/** Decodes an OSHM string such as "HVqp3ms" or "HC/Td/Ncbsa" (one entry per morpheme). */
export function decodeHebrewMorph(morph: string): DecodedHebrew {
  const aramaic = morph[0] === 'A'
  const body = morph.slice(1)
  const segments = body.split('/').filter(Boolean).map((s) => decodeHebrewSegment(s, aramaic))
  return {
    language: aramaic ? 'Aramaic' : 'Hebrew',
    segments,
    summary: segments.map((s) => s.summary).join(' + '),
  }
}

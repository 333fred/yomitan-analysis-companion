import { TokenizerBuilder, type IpadicFeatures, type LoaderConfig } from '@patdx/kuromoji';

const DICT_CDN_BASE =
  'https://cdn.jsdelivr.net/npm/@patdx/kuromoji@0.1.1/dict/';
const CACHE_NAME = 'ycc-kuromoji-dict';

/** Mapped token with English POS labels and hiragana reading. */
export interface MorphToken {
  surface: string;
  reading: string;
  baseForm: string;
  pos: string;
  posDetail: string;
  conjugatedType: string;
  conjugatedForm: string;
}

// ── POS mapping (IPADic Japanese → English) ─────────────────────────

const POS_MAP: Record<string, string> = {
  名詞: 'Noun',
  動詞: 'Verb',
  形容詞: 'i-Adjective',
  形容動詞: 'na-Adjective',
  助詞: 'Particle',
  助動詞: 'Auxiliary',
  副詞: 'Adverb',
  接続詞: 'Conjunction',
  感動詞: 'Interjection',
  連体詞: 'Adnominal',
  接頭詞: 'Prefix',
  記号: 'Symbol',
  フィラー: 'Filler',
};

const POS_DETAIL_MAP: Record<string, string> = {
  格助詞: 'Case',
  係助詞: 'Binding',
  副助詞: 'Adverbial',
  接続助詞: 'Conjunctive',
  終助詞: 'Sentence-ending',
  並立助詞: 'Coordinating',
  代名詞: 'Pronoun',
  固有名詞: 'Proper noun',
  数: 'Number',
  サ変接続: 'Suru-verb',
  副詞可能: 'Adverbial',
  自立: '',
  非自立: 'Dependent',
  接尾: 'Suffix',
};

// ── Helpers ─────────────────────────────────────────────────────────

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function mapPos(pos: string): string {
  return POS_MAP[pos] ?? pos;
}

function mapPosDetail(detail: string): string {
  if (detail === '*') return '';
  return POS_DETAIL_MAP[detail] ?? detail;
}

function formatPos(pos: string, detail1: string): string {
  const main = mapPos(pos);
  const detail = mapPosDetail(detail1);
  if (!detail) return main;
  if (detail === 'Pronoun') return detail;
  return `${main} (${detail})`;
}

// ── Tokenizer singleton ─────────────────────────────────────────────

interface KuromojiTokenizer {
  tokenize(text: string): IpadicFeatures[];
}

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

function getTokenizer(): Promise<KuromojiTokenizer> {
  if (tokenizerPromise) return tokenizerPromise;

  const loader: LoaderConfig = {
    async loadArrayBuffer(url: string): Promise<ArrayBufferLike> {
      // Strip .gz — CDN serves uncompressed files
      const cleanUrl = url.replace(/\.gz$/, '');
      const fullUrl = cleanUrl.startsWith('http')
        ? cleanUrl
        : DICT_CDN_BASE + cleanUrl;

      // Try cache first
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(fullUrl);
      if (cached) {
        return cached.arrayBuffer();
      }

      const response = await fetch(fullUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch dictionary: ${fullUrl} (${response.status})`);
      }

      // Cache for next time
      await cache.put(fullUrl, response.clone());
      return response.arrayBuffer();
    },
  };

  tokenizerPromise = new TokenizerBuilder({ loader })
    .build()
    .catch((err) => {
      tokenizerPromise = null; // Allow retry on failure
      throw err;
    });

  return tokenizerPromise;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Tokenize a Japanese sentence using kuromoji (IPADic).
 * Returns structured tokens with English POS labels and hiragana readings.
 */
export async function tokenize(sentence: string): Promise<MorphToken[]> {
  const tokenizer = await getTokenizer();
  const rawTokens = tokenizer.tokenize(sentence);

  return rawTokens.map((t) => ({
    surface: t.surface_form,
    reading: t.reading ? katakanaToHiragana(t.reading) : t.surface_form,
    baseForm: t.basic_form !== '*' ? t.basic_form : t.surface_form,
    pos: formatPos(t.pos, t.pos_detail_1),
    posDetail: [t.pos_detail_2, t.pos_detail_3].filter((d) => d !== '*').join(', '),
    conjugatedType: t.conjugated_type !== '*' ? t.conjugated_type : '',
    conjugatedForm: t.conjugated_form !== '*' ? t.conjugated_form : '',
  }));
}

/**
 * Format tokens as a markdown table for inclusion in AI prompts.
 */
export function formatTokensForPrompt(tokens: MorphToken[]): string {
  const rows = tokens.map((t) => {
    const base = t.surface === t.baseForm ? '' : ` → ${t.baseForm}`;
    return `| ${t.surface} | ${t.reading} | ${t.pos} |${base ? ` ${base} |` : ' |'}`;
  });

  return [
    '| Word | Reading | POS | Base Form |',
    '|------|---------|-----|-----------|',
    ...rows,
  ].join('\n');
}

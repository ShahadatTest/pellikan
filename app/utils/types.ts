export interface Word {
  id: number; verse: number; position: number; lang: 'heb' | 'arc' | 'grc'; text: string; trail: string | null
  lemma: string | null; lemma_key: string; strongs: string | null; pos: string | null; morph: string; variant: string | null
}

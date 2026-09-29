import { createContext, useContext } from 'react'

/** Lets article-ref chips in the transcript focus the matching citation card. */
export const CiteContext = createContext<(article: string) => void>(() => {})

export const useCite = () => useContext(CiteContext)

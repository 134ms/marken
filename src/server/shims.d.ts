declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  interface Options { enabled?: boolean; label?: boolean; labelAfter?: boolean }
  const plugin: (md: MarkdownIt, options?: Options) => void
  export default plugin
}

declare module '@traptitech/markdown-it-katex' {
  import type MarkdownIt from 'markdown-it'
  interface Options {
    throwOnError?: boolean
    output?: 'html' | 'mathml' | 'htmlAndMathml'
    [key: string]: unknown
  }
  const plugin: (md: MarkdownIt, options?: Options) => void
  export default plugin
}

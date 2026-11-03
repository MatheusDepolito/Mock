/**
 * Tailwind only emits the CSS variable of a theme token that some utility
 * uses. The "Tokens" page draws its samples with `var(--token)`, so each token
 * that can be sampled lists one utility here (written as a complete string, so
 * Tailwind reads it) to guarantee that its variable exists in the stylesheet.
 * A test fails when a token of `tokens.css` is missing from this map.
 */
export const SAMPLE_CLASSES: Readonly<Record<string, string>> = {
  '--color-primary': 'bg-primary',
  '--color-primary-foreground': 'bg-primary-foreground',
  '--color-surface': 'bg-surface',
  '--color-surface-raised': 'bg-surface-raised',
  '--color-content': 'bg-content',
  '--color-content-muted': 'bg-content-muted',
  '--color-border': 'bg-border',
  '--color-danger': 'bg-danger',
  '--color-success': 'bg-success',
  '--radius-none': 'rounded-none',
  '--radius-sm': 'rounded-sm',
  '--radius-md': 'rounded-md',
  '--shadow-card': 'shadow-card',
  '--font-sans': 'font-sans',
};

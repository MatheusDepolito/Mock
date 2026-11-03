import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import readme from '../../README.md?raw';
import tokensCss from '../styles/tokens.css?raw';
import { cx } from '../internal/cx';
import { SAMPLE_CLASSES } from './tokens-samples';
import { parseThemeTokens, parseTokenTable } from './tokens-parser';
import type { ThemeToken, TokenGroup } from './tokens-parser';

// Parsed when the module is evaluated: a malformed file breaks the story (and
// its test) instead of rendering an empty page.
const TOKENS = parseThemeTokens(tokensCss);
const TABLE = parseTokenTable(readme);

const SECTIONS: ReadonlyArray<{ group: TokenGroup; title: string }> = [
  { group: 'color', title: 'Cores' },
  { group: 'spacing', title: 'Espaçamento' },
  { group: 'radius', title: 'Raios' },
  { group: 'shadow', title: 'Sombras' },
  { group: 'breakpoint', title: 'Pontos de quebra' },
  { group: 'font', title: 'Família de fonte' },
];

const BOX = 'inline-block h-10 w-24 border border-border';

/** Sample drawn with `var(--token)`: the value is never repeated here. */
function Sample({ token }: { token: ThemeToken }): ReactNode {
  const variable = `var(${token.name})`;
  const sampleClass = SAMPLE_CLASSES[token.name];
  const styles: Record<TokenGroup, CSSProperties | null> = {
    color: { backgroundColor: variable },
    spacing: { width: `calc(${variable} * 4)` },
    radius: { borderRadius: variable },
    shadow: { boxShadow: variable },
    breakpoint: null,
    font: { fontFamily: variable },
  };
  const style = styles[token.group];
  if (style === null) return <span aria-hidden="true">—</span>;
  if (token.group === 'font') {
    return (
      <span className={cx('text-lg', sampleClass)} style={style}>
        Aa Bb Cc 123
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        token.group === 'spacing' ? 'inline-block h-3 bg-content-muted' : BOX,
        token.group === 'color' ? sampleClass : undefined,
        token.group === 'radius' || token.group === 'shadow'
          ? cx('bg-surface-raised', sampleClass)
          : undefined,
      )}
      style={style}
    />
  );
}

const CELL = 'border-b border-border px-3 py-2 text-left align-middle';

function TokensPage() {
  return (
    <main className="flex flex-col gap-10 font-sans text-base text-content">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">Tokens de design</h1>
        <p className="max-w-2xl text-content-muted">
          Os tokens são propriedade de <code>libs/ui</code>, definidos em CSS no{' '}
          <code>@theme</code> do Tailwind. Esta página lê{' '}
          <code>tokens.css</code> e mostra cada token semântico com a amostra
          desenhada por <code>var(--token)</code>. O valor muda, o nome não.
        </p>
      </header>
      {SECTIONS.map(({ group, title }) => {
        const rows = TOKENS.filter((token) => token.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{title}</h2>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col" className={CELL}>
                    Token
                  </th>
                  <th scope="col" className={CELL}>
                    Valor
                  </th>
                  <th scope="col" className={CELL}>
                    Amostra
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((token) => (
                  <tr key={token.name}>
                    <th scope="row" className={cx(CELL, 'font-medium')}>
                      <code>{token.name}</code>
                    </th>
                    <td className={CELL}>
                      <code>{token.resolved}</code>
                    </td>
                    <td className={CELL}>
                      <Sample token={token} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          Contrato de nomes: token, utilitário e papel
        </h2>
        <p className="max-w-2xl text-content-muted">
          Os nomes semânticos são o contrato com o Figma. As escalas internas (
          <code>--scale-*</code>) não fazem parte dele.
        </p>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Contrato de nomes dos tokens</caption>
          <thead>
            <tr>
              <th scope="col" className={CELL}>
                Token
              </th>
              <th scope="col" className={CELL}>
                Utilitários do Tailwind
              </th>
              <th scope="col" className={CELL}>
                Papel
              </th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map((row) => (
              <tr key={row.token}>
                <th scope="row" className={cx(CELL, 'font-medium')}>
                  {row.token.replaceAll('`', '')}
                </th>
                <td className={CELL}>{row.utilities.replaceAll('`', '')}</td>
                <td className={CELL}>{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tokens: Story = { render: () => <TokensPage /> };

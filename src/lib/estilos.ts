/**
 * Aparência do `<select>` nativo, igual à dos campos do shadcn.
 *
 * As opções e os grupos recebem as cores do popover: o fundo do select é
 * transparente, e alguns navegadores (Chrome) usam esse fundo na lista aberta,
 * que ficava branca com o texto claro do tema escuro. O `color-scheme` do
 * `index.css` cuida do resto (calendário do campo de data, barras de rolagem).
 */
export const CLASSE_SELECT =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 [&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground [&_option]:bg-popover [&_option]:text-popover-foreground'

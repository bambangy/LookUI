# LookUI Project Structure

## Implemented Components

### Element-bound (src/js/components/)
- UI: `lkButton`, `lkModal`
- Form: `lkTextbox`, `lkDropdown`, `lkCheckbox`, `lkRadio`, `lkSwitch`
- Interactive: `lkCarousel`, `lkSlider`, `lkTooltip`, `lkRating`, `lkChip`, `lkList`, `lkPagination`, `lkProgress`, `lkSplitter`, `lkTable`

### Composables (src/js/compossables/)
- `lkDate`, `lkDialog`, `lkToast`, `lkLoading`, `lkInnerLoading`
- `lkPingBadge`, `lkPopupProxy`, `lkShimmer`, `lkStorage`

### Data Helper (src/js/helpers/dataSource.js)
- `lkDataSource` / `createDataSource`

### CSS-only (no JS yet)
- Avatar, Badge, Bar, Breadcrumbs, Card, Spinner, Timeline, Toolbar

## Icon System
- `lkIcon(name, opts)` — SVG inline via CSS mask-image
- ~55 icons; size: xs/sm/lg/xl/2xl; color: primary/secondary/positive/negative/warning/info/muted

## SCSS Structure
```
src/scss/
├── main.scss
├── tokens/
├── base/
├── layout/
├── components/
└── utilities/
```

## Examples
- `examples/index.html` — main launcher
- `examples/composables.html` — composable demos
- `examples/datasource.html` — DataSource demo

## Public API Entry
- JS: `src/js/index.js` → `dist/look.js`
- CSS: `src/scss/main.scss` → `dist/look.css`

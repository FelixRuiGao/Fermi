---
name: i18n
description: Internationalize code by extracting hardcoded user-facing strings into the project's i18n framework, with correct plurals, interpolation, and locale formatting. Use when asked to add i18n or localize a component.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; ICU MessageFormat / Unicode CLDR concepts (no text reused)
---

# Internationalization

Separate translatable text from code without breaking meaning.

## 1. Find the framework and conventions

Detect the existing i18n stack (i18next/react-intl/FormatJS, gettext, Rails
i18n, Vue/Angular i18n, ICU) and where catalogs live (`locales/`, `.po`,
`.json`). Match the existing key style and file layout. If there's no framework
and the project needs one, recommend the idiomatic choice — don't invent a
bespoke system. `$ARGUMENTS` may scope to a file/component.

## 2. Extract correctly

- Replace user-visible literals with translation calls + stable, namespaced
  keys (e.g. `checkout.button.pay`), not the English text as the key unless the
  framework expects that.
- **Interpolation**: use the framework's variable syntax — never string-
  concatenate fragments (word order differs per language).
- **Plurals**: use ICU/`plural` categories (`one`, `other`, … and `few`/`many`
  where the framework supports CLDR) — not `if (n === 1)`.
- **Gender/select** where the framework supports it.
- Keep punctuation/whitespace inside the message; don't split a sentence across
  keys.

## 3. Don't translate what isn't language

Leave code identifiers, log messages, IDs, and developer-facing strings alone.
Locale-format dates, numbers, currency via the Intl/locale API — don't hardcode
formats.

## 4. Wire up and verify

Add the new keys to the default locale catalog (and stubs for others, marked
untranslated). Ensure no missing-key warnings, the default language renders
unchanged, and pluralized/interpolated cases work. Report extracted strings
count, the catalog files touched, and anything ambiguous that a translator/PM
should review (e.g. strings that depend on context).

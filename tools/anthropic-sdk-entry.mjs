// Vstupný bod pre zbalenie oficiálneho Anthropic SDK do jedného súboru pre prehliadač
// (aplikácia nemá build – výsledok sa ukladá do js/vendor/anthropic-sdk.mjs, pozri tools/build-sdk.sh)
export { default as Anthropic } from '@anthropic-ai/sdk';
export { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

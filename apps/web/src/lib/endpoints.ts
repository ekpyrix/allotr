import {
  accountListSchema,
  accountSchema,
  appearanceSchema,
  archiveAccountBodySchema,
  categoryListSchema,
  createAccountBodySchema,
  createTransactionBodySchema,
  editedTransactionSchema,
  ledgerSettingsSchema,
  onboardingStatusSchema,
  reverseTransactionBodySchema,
  sessionSchema,
  sessionUserSchema,
  signUpBodySchema,
  tagListSchema,
  todaySchema,
  transactionListSchema,
  transactionSchema,
  updateAccountBodySchema,
  updateLedgerSettingsBodySchema,
} from '@allotr/shared';
import { z } from 'zod';
import { endpoint } from './api.ts';

// Every server call the web app makes. Paths use the OpenAPI `{name}` form;
// endpoints.test.ts checks them against docs/openapi.json.

const signInBodySchema = z.object({ email: z.string(), password: z.string() });

export const endpoints = {
  onboardingStatus: endpoint({
    method: 'GET',
    path: '/v1/onboarding',
    response: onboardingStatusSchema,
  }),
  createFirstAccount: endpoint({
    method: 'POST',
    path: '/v1/onboarding',
    body: signUpBodySchema,
    response: z.object({ user: sessionUserSchema }),
  }),
  session: endpoint({
    method: 'GET',
    path: '/v1/session',
    response: sessionSchema,
  }),
  signIn: endpoint({
    method: 'POST',
    path: '/v1/auth/sign-in/email',
    body: signInBodySchema,
    response: z.union([
      z.object({ twoFactorRedirect: z.literal(true) }),
      z.object({ user: z.object({ id: z.string() }) }),
    ]),
    openapi: false,
  }),
  verifyTotp: endpoint({
    method: 'POST',
    path: '/v1/auth/two-factor/verify-totp',
    body: z.object({ code: z.string() }),
    response: z.unknown(),
    openapi: false,
  }),
  signOut: endpoint({
    method: 'POST',
    path: '/v1/auth/sign-out',
    body: z.object({}),
    response: z.unknown(),
    openapi: false,
  }),
  appearance: endpoint({
    method: 'GET',
    path: '/v1/settings/appearance',
    response: appearanceSchema,
  }),
  saveAppearance: endpoint({
    method: 'PUT',
    path: '/v1/settings/appearance',
    body: appearanceSchema,
    response: appearanceSchema,
  }),
  accounts: endpoint({
    method: 'GET',
    path: '/v1/accounts',
    response: accountListSchema,
  }),
  createAccount: endpoint({
    method: 'POST',
    path: '/v1/accounts',
    body: createAccountBodySchema,
    response: accountSchema,
  }),
  updateAccount: endpoint({
    method: 'PATCH',
    path: '/v1/accounts/{id}',
    body: updateAccountBodySchema,
    response: accountSchema,
  }),
  archiveAccount: endpoint({
    method: 'POST',
    path: '/v1/accounts/{id}/archive',
    body: archiveAccountBodySchema,
    response: accountSchema,
  }),
  categories: endpoint({
    method: 'GET',
    path: '/v1/categories',
    response: categoryListSchema,
  }),
  tags: endpoint({
    method: 'GET',
    path: '/v1/tags',
    response: tagListSchema,
  }),
  ledgerSettings: endpoint({
    method: 'GET',
    path: '/v1/settings/ledger',
    response: ledgerSettingsSchema,
  }),
  updateLedgerSettings: endpoint({
    method: 'PATCH',
    path: '/v1/settings/ledger',
    body: updateLedgerSettingsBodySchema,
    response: ledgerSettingsSchema,
  }),
  today: endpoint({
    method: 'GET',
    path: '/v1/today',
    response: todaySchema,
  }),
  transactions: endpoint({
    method: 'GET',
    path: '/v1/transactions',
    response: transactionListSchema,
  }),
  createTransaction: endpoint({
    method: 'POST',
    path: '/v1/transactions',
    body: createTransactionBodySchema,
    response: transactionSchema,
  }),
  transaction: endpoint({
    method: 'GET',
    path: '/v1/transactions/{id}',
    response: transactionSchema,
  }),
  editTransaction: endpoint({
    method: 'POST',
    path: '/v1/transactions/{id}/edit',
    body: createTransactionBodySchema,
    response: editedTransactionSchema,
  }),
  reverseTransaction: endpoint({
    method: 'POST',
    path: '/v1/transactions/{id}/reverse',
    body: reverseTransactionBodySchema,
    response: transactionSchema,
  }),
};

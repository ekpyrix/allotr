// English UI text (NFR-9). Other locales will mirror these keys. Plural
// messages are { one, other } objects chosen by `count`.
export const en = {
  app: { name: 'Allotr' },
  signIn: {
    title: 'Sign in',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    codeTitle: 'Enter your code',
    codeIntro:
      'Open your authenticator app and enter the 6-digit code for Allotr.',
    code: 'Code',
    verify: 'Verify',
    verifying: 'Checking…',
    otherAccount: 'Use a different account',
  },
  onboarding: {
    title: 'Set up Allotr',
    intro:
      'This first account runs the instance. You can invite others once you are in.',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least {min} characters.',
    submit: 'Create account',
    submitting: 'Creating account…',
  },
  notFound: {
    title: 'Page not found',
    intro: 'This address does not match a page in Allotr.',
    home: 'Go to Allotr',
  },
  nav: {
    label: 'Main',
    skip: 'Skip to content',
    today: 'Today',
    ledger: 'Ledger',
    accounts: 'Accounts',
    settings: 'Settings',
  },
  shell: {
    twoFactorRequired:
      'This instance requires two-factor authentication for your account. Setting it up from the web app arrives in a later release; ask your administrator in the meantime.',
  },
  today: {
    title: 'Left today',
    noFigure: 'No figure yet',
    greeting:
      'Hello {name}. Add your accounts and your next payday, and this is where you will see what you can spend today without touching savings or bill money.',
    moneyLabel: 'Your money',
    spendable: 'Spendable',
    spendableHint: 'On-budget accounts count toward your daily number.',
    bills: 'Bills set aside',
    billsHint: 'Reserved before the daily number is worked out.',
  },
  ledger: {
    title: 'Ledger',
    placeholder: 'Your entries will be listed here.',
  },
  accounts: {
    title: 'Accounts',
    placeholder: 'Your accounts and their balances will be shown here.',
  },
  settings: {
    title: 'Settings',
    placeholder: 'Ledger, security and appearance settings will be here.',
    signOut: 'Sign out',
    shortcuts: 'Single-key shortcuts',
    shortcutsHint:
      'Press N to add an entry. Turn this off if you use speech input or a switch device.',
  },
  quickEntry: {
    add: 'Add',
    title: 'Add an entry',
    close: 'Close',
    kind: 'Type',
    kinds: { expense: 'Expense', income: 'Income', transfer: 'Transfer' },
    amount: 'Amount',
    amountIn: 'Amount in {currency}',
    receivedIn: 'Received in {currency}',
    account: 'Account',
    fromAccount: 'From',
    toAccount: 'To',
    category: 'Category',
    categoryOptional: 'Category (optional)',
    chooseCategory: 'Choose a category',
    noCategory: 'None',
    date: 'Date',
    note: 'Note',
    tags: 'Tags',
    save: 'Save',
    saving: 'Saving…',
    loading: 'Loading your accounts…',
    noAccounts: 'Add an account before you log entries.',
    goToAccounts: 'Go to Accounts',
    saved: {
      expense: 'Expense of {amount} saved.',
      income: 'Income of {amount} saved.',
      transfer: 'Transfer of {amount} saved.',
    },
    errors: {
      amountRequired: 'Enter an amount.',
      amountInvalid: 'Enter an amount, for example 12.50.',
      amountDecimals: 'This currency has fewer decimal places.',
      amountPositive:
        'Enter the amount without a sign; the type sets the direction.',
      accountRequired: 'Choose an account.',
      toAccountRequired: 'Choose the account the money goes to.',
      sameAccount: 'Choose two different accounts.',
      categoryRequired: 'Choose a category.',
      dateInvalid: 'Enter a date.',
    },
  },
  errors: {
    pageTitle: 'This page could not load',
    retry: 'Try again',
    network:
      'Allotr could not reach the server. Check your connection and try again.',
    validationSummary: {
      one: '{count} field needs attention.',
      other: '{count} fields need attention.',
    },
    fieldProblem: '{field}: {message}',
    notFound: 'This item no longer exists. Refresh and try again.',
    conflict: 'This changed in the meantime. Refresh and try again.',
    tooMany: 'Too many attempts. Wait a minute and try again.',
    unexpected: 'The server answered {status} {title}.',
    codes: {
      unauthenticated: 'You are signed out. Sign in again to continue.',
      two_factor_enrollment_required:
        'Set up two-factor authentication before you continue.',
      onboarding_complete: 'Allotr is already set up. Sign in instead.',
      registration_closed: 'This instance is not accepting new accounts.',
      origin_mismatch:
        'This request came from another site and was refused. Open Allotr from its own address.',
    },
  },
} as const;

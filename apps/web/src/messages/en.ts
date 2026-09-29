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
    loading: 'Loading today’s figures',
    over: 'Over by {amount}',
    overHint:
      'Today’s spending is past today’s allowance. The days left share what remains.',
    liveDaily: {
      one: '{amount}/day for {count} day',
      other: '{amount}/day for {count} days',
    },
    figuresLabel: 'Today’s figures',
    allowance: 'Today’s allowance',
    spentToday: 'Spent today',
    daysLeft: 'Days left',
    payday: 'Payday',
    paydayOverdue: 'Overdue',
    greeting:
      'Hello {name}. Add your accounts and your next payday, and this is where you will see what you can spend today without touching savings or bill money.',
    pace: {
      title: 'This cycle',
      spent: 'Spent {spent} of {budget}',
      day: 'Day {day} of {days}',
      value: '{spentPercent}% spent, {timePercent}% of the cycle gone',
      onPace: 'On pace',
      ahead: 'Spending ahead of the days',
      timeMarker: 'Where spending would be at an even pace',
    },
    attention: {
      title: 'Needs attention',
      overdue:
        'Payday has passed without a paycheck. Until one is logged, the cycle runs one day at a time.',
      overdueAction: 'Check payday',
      missingRate:
        'There is no exchange rate for {currency}, so {currency} accounts are left out of these figures.',
      missingRateAction: 'Add a {currency} rate',
      billDue: '{name}, {amount}, was due {date} and is not marked paid.',
      billDueToday: '{name}, {amount}, is due today and is not marked paid.',
      billAction: 'Review {name}',
    },
    entries: {
      title: 'Today’s entries',
      empty: 'Nothing logged today.',
      add: 'Add an entry',
      undo: 'Undo',
      undoing: 'Undoing…',
      undoLabel: 'Undo {entry}',
      undone: 'Undone',
      undoneAnnounce: 'Undone: {entry}.',
      confirmPaycheck:
        'This paycheck opened the current cycle. Undoing it merges this cycle back into the previous one.',
      confirmUndo: 'Undo paycheck',
      keep: 'Keep it',
      kinds: {
        expense: 'Expense',
        income: 'Income',
        transfer: 'Transfer',
        opening: 'Opening balance',
        write_off: 'Write-off',
      },
    },
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
    offline:
      'You are offline. Entries need a connection; the form opens when you are back online.',
    noAccounts: 'Add an account before you log entries.',
    goToAccounts: 'Go to Accounts',
    saved: {
      expense: 'Expense of {amount} saved.',
      income: 'Income of {amount} saved.',
      transfer: 'Transfer of {amount} saved.',
    },
    errors: {
      amountRequired: 'Enter an amount.',
      amountInvalid: 'Enter an amount, for example {example}.',
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
  offline: {
    title: 'You are offline',
    intro:
      'Allotr needs a connection to show your figures. This page loads again when you are back online.',
  },
  update: {
    ready: 'A new version of Allotr is ready.',
    reload: 'Reload',
    later: 'Later',
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

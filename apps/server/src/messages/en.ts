// English text the server composes for users (NFR-9). Other languages will
// mirror these keys in their own file and register it in t.ts. Plural
// messages are { one, other } objects chosen by `count`.
export const en = {
  reminders: {
    unnamedBill: 'A bill',
    billDue: {
      title: '{name} is due {date}',
      body: '{amount} is set aside for it. Mark it paid when it goes out.',
    },
    iouDue: {
      owedToMe: {
        title: '{person} was due to pay you back today',
        body: '{amount} is still owed.',
      },
      owedByMe: {
        title: 'You were due to pay {person} today',
        body: '{amount} is still owed.',
      },
    },
    iouOverdue: {
      owedToMe: {
        title: {
          one: '{person} is {count} day late',
          other: '{person} is {count} days late',
        },
        body: '{amount} is still owed to you.',
      },
      owedByMe: {
        title: {
          one: 'You are {count} day late paying {person}',
          other: 'You are {count} days late paying {person}',
        },
        body: '{amount} is still owed.',
      },
    },
    weeklyReview: {
      title: 'Your week is ready',
      body: 'See what you spent and how the budgets stand.',
    },
  },
} as const;

import type { SessionUser } from '@allotr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/session';

// M0 placeholder: the daily number arrives with accounts and cycles (M1).
export function TodayPage({
  user,
  twoFactorRequired,
}: {
  user: SessionUser;
  twoFactorRequired: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-5">
        <Wordmark />
        <Button
          variant="link"
          className="px-0 text-foreground"
          onClick={() => {
            void signOut(queryClient).then(() => navigate({ to: '/sign-in' }));
          }}
        >
          Sign out
        </Button>
      </header>

      <main className="flex flex-1 flex-col pt-10 pb-16 sm:pt-20">
        <h1 className="text-lg font-medium text-muted-foreground">
          Left today
        </h1>
        <p
          className="mt-1 text-8xl leading-[0.75] font-semibold tracking-tighter text-today sm:text-9xl"
          aria-label="No figure yet"
        >
          —
        </p>
        <p className="mt-6 max-w-prose text-lg">
          Hello {user.name}. Add your accounts and your next payday, and this is
          where you will see what you can spend today without touching savings
          or bill money.
        </p>

        {twoFactorRequired ? (
          <p role="status" className="mt-6 max-w-prose rounded-md bg-plot p-4">
            This instance requires two-factor authentication for your account.
            Setting it up from the web app arrives in the next release; ask your
            administrator in the meantime.
          </p>
        ) : null}

        <section
          aria-label="Your money"
          className="mt-12 grid gap-3 sm:grid-cols-[2fr_1fr]"
        >
          <div className="min-h-36 rounded-md bg-plot p-5">
            <h2 className="font-medium">Spendable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              On-budget accounts count toward your daily number.
            </p>
          </div>
          <div className="min-h-36 rounded-md border-2 border-dashed border-input p-5">
            <h2 className="font-medium">Bills set aside</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserved before the daily number is worked out.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { KeyFigures } from '@/components/stats';
import { formatMoney } from '@/lib/format-money';
import { emergencyFundQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';

export function EmergencyFundTile() {
  const fund = useQuery(emergencyFundQuery);
  const data = fund.data;

  return (
    <Tile title={t('dashboardTiles.emergencyFund.title')}>
      {fund.isError ? (
        <TileFailed
          onRetry={() => {
            void fund.refetch();
          }}
        />
      ) : data === undefined ? (
        <SkeletonTile />
      ) : (
        <div className="grid gap-2 pt-2">
          <div className="text-stat font-semibold">
            <Amount amount={data.saved} locale={locale} />
          </div>
          <p className="num truncate text-small text-text-muted">
            {t('dashboardTiles.emergencyFund.saved', {
              saved: formatMoney(data.saved, 'symbol', locale),
              target: formatMoney(data.target, 'symbol', locale),
            })}
          </p>
          <Bar
            value={data.progressBasisPoints / 10000}
            label={t('dashboardTiles.emergencyFund.progress')}
          />
          {data.historyCycles === 0 ? (
            <p className="font-sans text-small text-text-muted">
              {t('dashboardTiles.emergencyFund.noHistory')}
            </p>
          ) : (
            <KeyFigures
              figures={[
                {
                  label: t('dashboardTiles.emergencyFund.covers'),
                  figure:
                    data.monthsCovered === null
                      ? '–'
                      : t('dashboardTiles.emergencyFund.coversValue', {
                          months: String(
                            Math.round(data.monthsCovered * 10) / 10,
                          ),
                        }),
                },
                {
                  label: t('dashboardTiles.emergencyFund.perCycle'),
                  figure: formatMoney(data.monthlyExpenses, 'symbol', locale),
                },
                {
                  label: t('dashboardTiles.emergencyFund.range'),
                  figure: t('dashboardTiles.emergencyFund.rangeValue', {
                    low: formatMoney(data.targetLow, 'symbol', locale),
                    high: formatMoney(data.targetHigh, 'symbol', locale),
                  }),
                },
              ]}
            />
          )}
        </div>
      )}
    </Tile>
  );
}

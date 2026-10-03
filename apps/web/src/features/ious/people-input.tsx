import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { FieldControl } from '@/components/field';
import { Input } from '@/components/ui/input';
import { peopleQuery } from '@/lib/ious';

/** A free-text name with suggestions from names used before. */
export function PeopleInput({
  label,
  name,
  value,
  error,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const people = useQuery(peopleQuery(value.trim()));
  return (
    <FieldControl label={label} error={error}>
      {(props) => (
        <>
          <Input
            {...props}
            name={name}
            value={value}
            list={listId}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              onChange(e.currentTarget.value);
            }}
          />
          <datalist id={listId}>
            {(people.data?.people ?? []).map((person) => (
              <option key={person} value={person} />
            ))}
          </datalist>
        </>
      )}
    </FieldControl>
  );
}

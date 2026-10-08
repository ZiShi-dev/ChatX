import { IonSearchbar } from '@ionic/react';

type SearchBarProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, placeholder, onChange }: SearchBarProps) {
  return (
    <IonSearchbar
      value={value}
      placeholder={placeholder}
      debounce={150}
      onIonInput={(event) => onChange(event.detail.value ?? '')}
    />
  );
}

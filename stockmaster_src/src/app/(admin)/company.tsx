import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, HelperText, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  getCompany,
  getCountryCurrencyMap,
  updateBusinessCurrency,
  updateCompany,
} from '@/features/employees/api';
import { companySchema, CompanyInput } from '@/schemas/organization';

export default function CompanyScreen() {
  const { membership, refreshMembership } = useAuth();
  const companyId = membership?.companyId ?? '';
  const queryClient = useQueryClient();
  const company = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => getCompany(companyId),
    enabled: !!companyId,
  });
  const countries = useQuery({
    queryKey: ['country-currency-map'],
    queryFn: getCountryCurrencyMap,
  });
  const { control, handleSubmit, reset, formState } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    values: { name: company.data?.name ?? '' },
  });
  const [countryCode, setCountryCode] = useState('');
  const [primaryCurrency, setPrimaryCurrency] = useState('');
  const [secondaryCurrency, setSecondaryCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!company.data) return;
    setCountryCode(company.data.country_code);
    setPrimaryCurrency(company.data.default_currency_code);
    setSecondaryCurrency(company.data.secondary_currency_code);
  }, [company.data]);

  const selectedCountry = countries.data?.find((country) => country.country_code === countryCode);
  const secondaryOptions = useMemo(() => [
    { label: 'Aucune devise secondaire', value: null },
    ...(selectedCountry?.allowed_currency_codes ?? [])
      .filter((code) => code !== primaryCurrency)
      .map((code) => ({ label: code, value: code })),
  ], [primaryCurrency, selectedCountry]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['businesses'] });
    await refreshMembership();
  };
  const nameMutation = useMutation({
    mutationFn: (value: CompanyInput) => updateCompany(companyId, value.name),
    onSuccess: async () => { await refresh(); reset(); },
  });
  const currencyMutation = useMutation({
    mutationFn: () => updateBusinessCurrency(companyId, countryCode, primaryCurrency, secondaryCurrency),
    onSuccess: refresh,
  });
  const locked = !!company.data?.currency_locked_at;

  return (
    <AdminPage title="Entreprise">
      <Text variant="bodyLarge">Identité et configuration monétaire de l’entreprise.</Text>
      <FormField control={control} name="name" label="Nom de l’entreprise" disabled={company.isLoading} />
      {!!nameMutation.error && <HelperText type="error" visible>{nameMutation.error.message}</HelperText>}
      <AppButton
        onPress={handleSubmit((value) => nameMutation.mutate(value))}
        loading={nameMutation.isPending}
        disabled={!formState.isDirty}
      >
        Enregistrer le nom
      </AppButton>

      <Card mode="outlined">
        <Card.Title title="Pays et devises" subtitle={locked ? 'Verrouillé après la première vente' : 'Modifiable avant la première vente'} />
        <Card.Content>
          <SelectField
            label="Pays d’activité"
            value={countryCode}
            onChange={(value) => {
              setCountryCode(value ?? '');
              setPrimaryCurrency(countries.data?.find((country) => country.country_code === value)?.default_currency_code ?? '');
              setSecondaryCurrency(null);
            }}
            options={(countries.data ?? []).map((country) => ({
              label: `${country.country_name} — ${country.default_currency_code}`,
              value: country.country_code,
            }))}
          />
          <SelectField
            label="Devise principale"
            value={primaryCurrency}
            onChange={(value) => {
              setPrimaryCurrency(value ?? selectedCountry?.default_currency_code ?? '');
              if (value === secondaryCurrency) setSecondaryCurrency(null);
            }}
            options={(selectedCountry?.allowed_currency_codes ?? []).map((code) => ({ label: code, value: code }))}
          />
          <SelectField
            label="Devise secondaire d’affichage"
            value={secondaryCurrency}
            onChange={setSecondaryCurrency}
            options={secondaryOptions}
          />
          {locked && <HelperText type="info" visible>Une vente existe. Seul un Super Administrateur peut effectuer un changement exceptionnel et audité.</HelperText>}
          {!!currencyMutation.error && <HelperText type="error" visible>{currencyMutation.error.message}</HelperText>}
          <AppButton
            onPress={() => currencyMutation.mutate()}
            loading={currencyMutation.isPending}
            disabled={locked || !countryCode}
          >
            Enregistrer les devises
          </AppButton>
        </Card.Content>
      </Card>
    </AdminPage>
  );
}

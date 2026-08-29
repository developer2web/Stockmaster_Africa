import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, HelperText, Switch, Text, TextInput } from 'react-native-paper';

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
  updateBusinessSettings,
} from '@/features/employees/api';
import { companySchema, CompanyInput } from '@/schemas/organization';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

export default function CompanyScreen() {
  const { membership, refreshMembership } = useAuth();
  const { canUseFeature } = useSubscription();
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
  const [settings,setSettings]=useState({phone:'',email:'',address:'',language:'fr' as 'fr'|'en',taxRate:'0',allowDiscounts:false,allowCreditSales:true,allowNegativeStock:false,maxDiscountPercent:'100',requireRefundReason:true,cashOpeningRequired:false,cashVarianceReasonThreshold:'0',expenseApprovalThreshold:'',lowStockAlerts:true,receiptFooter:''});

  useEffect(() => {
    if (!company.data) return;
    setCountryCode(company.data.country_code);
    setPrimaryCurrency(company.data.default_currency_code);
    setSecondaryCurrency(company.data.secondary_currency_code);
    setSettings({phone:company.data.phone??'',email:company.data.email??'',address:company.data.address??'',language:company.data.language??'fr',taxRate:String(company.data.tax_rate??0),allowDiscounts:company.data.allow_discounts??false,allowCreditSales:company.data.allow_credit_sales??true,allowNegativeStock:company.data.allow_negative_stock??false,maxDiscountPercent:String(company.data.max_discount_percent??100),requireRefundReason:company.data.require_refund_reason??true,cashOpeningRequired:company.data.cash_opening_required??false,cashVarianceReasonThreshold:String(company.data.cash_variance_reason_threshold??0),expenseApprovalThreshold:company.data.expense_approval_threshold==null?'':String(company.data.expense_approval_threshold),lowStockAlerts:company.data.low_stock_alerts??true,receiptFooter:company.data.receipt_footer??''});
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
  const settingsMutation=useMutation({mutationFn:()=>updateBusinessSettings(companyId,{...settings,taxRate:0,allowCreditSales:false,maxDiscountPercent:Math.min(100,Math.max(0,Number(settings.maxDiscountPercent)||0)),cashOpeningRequired:canUseFeature('advanced_cash_closure')&&settings.cashOpeningRequired,cashVarianceReasonThreshold:canUseFeature('advanced_cash_closure')?Math.max(0,Number(settings.cashVarianceReasonThreshold)||0):0,expenseApprovalThreshold:canUseFeature('expense_approval')&&settings.expenseApprovalThreshold.trim()?Math.max(0,Number(settings.expenseApprovalThreshold)||0):null}),onSuccess:refresh});

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
      <Card mode="outlined">
        <Card.Title title="Coordonnées" subtitle="Informations visibles pour les clients et les équipes" />
        <Card.Content style={{ gap: 12 }}>
          <TextInput mode="outlined" label="Téléphone" value={settings.phone} onChangeText={(phone) => setSettings((value) => ({ ...value, phone }))} />
          <TextInput mode="outlined" label="Email" keyboardType="email-address" value={settings.email} onChangeText={(email) => setSettings((value) => ({ ...value, email }))} />
          <TextInput mode="outlined" label="Adresse" value={settings.address} onChangeText={(address) => setSettings((value) => ({ ...value, address }))} />
          <SelectField label="Langue" value={settings.language} onChange={(language) => setSettings((value) => ({ ...value, language: (language ?? 'fr') as 'fr' | 'en' }))} options={[{ label: 'Français', value: 'fr' }, { label: 'English', value: 'en' }]} />
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <Card.Title title="Règles de vente" subtitle="Réglages utiles sans surcharger l’écran" />
        <Card.Content style={{ gap: 12 }}>
          <TextInput mode="outlined" label="Remise maximale (%)" keyboardType="decimal-pad" value={settings.maxDiscountPercent} onChangeText={(maxDiscountPercent) => setSettings((value) => ({ ...value, maxDiscountPercent }))} />
          <TextInput mode="outlined" label="Message en bas du reçu" value={settings.receiptFooter} onChangeText={(receiptFooter) => setSettings((value) => ({ ...value, receiptFooter }))} />
          {([
            ['Autoriser les remises', 'allowDiscounts'],
            ['Autoriser le stock négatif', 'allowNegativeStock'],
            ['Motif obligatoire pour les remboursements', 'requireRefundReason'],
            ['Alertes de stock faible', 'lowStockAlerts'],
          ] as const).map(([label, key]) => (
            <Card key={key} mode="contained">
              <Card.Title title={label} right={() => <Switch value={settings[key]} onValueChange={(checked) => setSettings((value) => ({ ...value, [key]: checked }))} style={{ marginRight: 12 }} />} />
            </Card>
          ))}
        </Card.Content>
      </Card>

      <FeatureGate feature="advanced_cash_closure" label="Clôture de caisse avancée">
        <Card mode="outlined">
          <Card.Title title="Caisse" subtitle="Contrôles utiles uniquement pour la gestion avancée" />
          <Card.Content style={{ gap: 12 }}>
            <TextInput mode="outlined" label="Justifier un écart de caisse supérieur à" keyboardType="decimal-pad" value={settings.cashVarianceReasonThreshold} onChangeText={(cashVarianceReasonThreshold) => setSettings((value) => ({ ...value, cashVarianceReasonThreshold }))} />
            <Card mode="contained">
              <Card.Title title="Ouverture de caisse obligatoire" right={() => <Switch value={settings.cashOpeningRequired} onValueChange={(cashOpeningRequired) => setSettings((value) => ({ ...value, cashOpeningRequired }))} style={{ marginRight: 12 }} />} />
            </Card>
            <AppButton loading={settingsMutation.isPending} onPress={() => settingsMutation.mutate()}>Enregistrer la caisse</AppButton>
          </Card.Content>
        </Card>
      </FeatureGate>

      <FeatureGate feature="expense_approval" label="Approbation des dépenses">
        <Card mode="outlined">
          <Card.Title title="Dépenses" subtitle="Définissez le seuil d’approbation pour les dépenses" />
          <Card.Content style={{ gap: 12 }}>
            <TextInput mode="outlined" label="Seuil nécessitant l’accord Admin" keyboardType="decimal-pad" value={settings.expenseApprovalThreshold} onChangeText={(expenseApprovalThreshold) => setSettings((value) => ({ ...value, expenseApprovalThreshold }))} />
            <AppButton loading={settingsMutation.isPending} onPress={() => settingsMutation.mutate()}>Enregistrer le seuil</AppButton>
          </Card.Content>
        </Card>
      </FeatureGate>

      {!!settingsMutation.error && <HelperText type="error" visible>{settingsMutation.error.message}</HelperText>}
    </AdminPage>
  );
}

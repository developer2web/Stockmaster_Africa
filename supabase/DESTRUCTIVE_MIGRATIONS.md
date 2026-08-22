# Migrations historiques destructives

Deux migrations historiques exigent une revue avant toute création ou liaison d’un nouvel environnement :

- `202607270002_reset_non_super_admin_accounts.sql` supprime les comptes non-Super Admin présents à cette étape de l’historique ;
- `202608110002_delete_moustapha_amir_diallo.sql` supprime un compte ciblé et ses données associées.

## Règle obligatoire

Ne jamais exécuter `supabase db push` vers staging ou production sans :

1. une sauvegarde restaurable ;
2. `supabase migration list --linked` ;
3. une revue du plan de migrations restant à appliquer ;
4. la confirmation que ces migrations sont déjà enregistrées dans l’historique distant ;
5. un essai préalable sur une copie de staging.

Ne pas modifier silencieusement une migration déjà appliquée. Pour une nouvelle installation vierge, préparer un historique consolidé contrôlé au lieu de rejouer aveuglément les suppressions historiques.

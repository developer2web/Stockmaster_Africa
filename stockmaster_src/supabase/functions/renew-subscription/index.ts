import { handleCreatePayment } from '../_shared/payment.ts';

Deno.serve((request) => handleCreatePayment(request, true));

/**
 * The demo script's exact inputs. In replay mode these are the inputs with
 * recordings; the simulator offers them as one-click suggestions.
 */
export const DEMO = {
  rejectMarketing: 'Can I spend $120 on stickers for Calapalooza tabling?',
  gmPizza: "Can I spend $50 on pizza for Thursday's GM?",
  gmPizzaNote: 'Thursday is our recruiting GM, and walk-ins usually beat RSVPs. Recruiting GMs can go up to about $4.50 a head.',
  nextGmPizza: "Can I spend $60 on pizza for next Thursday's recruiting GM?",
  reimbursement: 'I already paid $86.40 for EEG electrode supplies for the headset project. Can I get reimbursed?',
  beerReimbursement: "I already paid $59.52 for pizza for Thursday's GM. Can I get reimbursed?",
  purchase: { merchantName: 'Telegraph Slice Co.', merchantCategory: 'restaurants', cleanCents: 4873, beerCents: 5952 },
} as const;

export const SAMPLE_RECEIPTS = [
  { file: 'pizza-clean.png', label: 'Pizza receipt ($48.73)' },
  { file: 'pizza-beer.png', label: 'Pizza + beer receipt ($59.52)' },
  { file: 'hardware-reimbursement.png', label: 'Electrode supplies receipt ($86.40)' },
] as const;

export const OFFICER_SUGGESTIONS = [
  { label: 'Over budget (Marketing)', text: DEMO.rejectMarketing },
  { label: 'GM pizza, $50', text: DEMO.gmPizza },
  { label: 'Next GM pizza, $60', text: DEMO.nextGmPizza },
  { label: 'Reimburse electrode supplies', text: DEMO.reimbursement, receipt: 'hardware-reimbursement.png' },
] as const;

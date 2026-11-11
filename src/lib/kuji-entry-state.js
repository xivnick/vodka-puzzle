export function kujiEntryState(context) {
  const balance = Number.isInteger(context?.remaining_tickets) && context.remaining_tickets > 0 ? context.remaining_tickets : 0;
  const participated = (context?.tickets ?? []).some(ticket => ticket.is_me === true);
  return { balance, visible: balance > 0 || participated, notify: balance > 0 };
}

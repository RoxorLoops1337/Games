// Finance: cash, loan, transactions, monthly summary.

export function makeFinance(startCash, loan = 10000, loanLimit = 20000) {
  return {
    cash: startCash,
    loan,
    loanLimit,
    interestRate: 0.015,   // monthly
    transactions: [],      // {month, year, category, amount, note}
    monthly: [],           // history of summaries
    parkAdmission: 0,      // 0 = free, otherwise admission price
    rideAdmission: true,   // true = peeps pay per ride
    recordTransaction(category, amount, note, suppress) {
      this.cash += amount;
      this.transactions.push({ category, amount, note, time: Date.now() });
      if (this.transactions.length > 600) this.transactions.shift();
      return amount;
    },
    takeLoan(amount) {
      if (this.loan + amount > this.loanLimit) amount = this.loanLimit - this.loan;
      if (amount <= 0) return 0;
      this.cash += amount;
      this.loan += amount;
      return amount;
    },
    payLoan(amount) {
      if (amount > this.cash) amount = this.cash;
      if (amount > this.loan) amount = this.loan;
      if (amount <= 0) return 0;
      this.cash -= amount;
      this.loan -= amount;
      return amount;
    },
    monthlyTick() {
      // pay interest
      const interest = Math.round(this.loan * this.interestRate);
      if (interest > 0) {
        this.cash -= interest;
        this.transactions.push({ category: 'interest', amount: -interest, note: 'Loan interest', time: Date.now() });
      }
      // summarize last month
      const summary = { income: 0, expense: 0, byCategory: {} };
      for (const t of this.transactions.slice(-200)) {
        if (!summary.byCategory[t.category]) summary.byCategory[t.category] = 0;
        summary.byCategory[t.category] += t.amount;
        if (t.amount >= 0) summary.income += t.amount;
        else summary.expense += -t.amount;
      }
      this.monthly.push(summary);
      if (this.monthly.length > 36) this.monthly.shift();
    },
    parkValue(rides, coasters) {
      let v = this.cash - this.loan;
      for (const r of rides) if (!r.demolished) v += 500;
      for (const c of coasters) if (!c.demolished) v += 1500 + c.pieces.length * 30;
      return v;
    },
  };
}

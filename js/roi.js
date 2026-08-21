/**
 * roi.js
 * ---------------------------------------------------------------------------
 * Customer-facing ROI calculator for the "What could this be worth to your
 * business?" section. Kept separate from engine.js (the chat AI) — this has
 * nothing to do with the conversation logic, it's a standalone planning
 * calculator. Pure calculation function + a DOM-wiring init function, same
 * split as chat.js/engine.js.
 *
 * This models the CUSTOMER's potential economics (what a business might get
 * back from paying for this), not the product's own internal economics —
 * there is deliberately no CAC/LTV/COGS/margin/capital-required here.
 * ---------------------------------------------------------------------------
 */

export const AI_COST_MONTHLY = 300;
export const AI_COST_ANNUAL = AI_COST_MONTHLY * 12;

/**
 * @param {{
 *   missedBookingsPerMonth: number,
 *   avgRevenuePerNewCustomer: number,
 *   recoveryRate: number,
 *   activeCustomers: number,
 *   currentRetentionRate: number,
 *   expectedRetentionRate: number,
 *   avgAnnualRevenuePerRetainedCustomer: number,
 *   reactivationEnabled: boolean,
 *   inactiveCustomers: number,
 *   reactivationRate: number,
 *   revenuePerReactivatedCustomer: number,
 * }} inputs  Rate fields are 0-1 decimals.
 */
export function calculateRoi(inputs) {
  const recoveredAnnualRevenue =
    inputs.missedBookingsPerMonth * inputs.recoveryRate * inputs.avgRevenuePerNewCustomer * 12;

  const retentionImprovement = inputs.expectedRetentionRate - inputs.currentRetentionRate;
  const additionalRetainedCustomers = inputs.activeCustomers * retentionImprovement;
  const retainedAnnualRevenue = additionalRetainedCustomers * inputs.avgAnnualRevenuePerRetainedCustomer;

  const reactivationAnnualRevenue = inputs.reactivationEnabled
    ? inputs.inactiveCustomers * inputs.reactivationRate * inputs.revenuePerReactivatedCustomer
    : 0;

  const totalAnnualImpact = recoveredAnnualRevenue + retainedAnnualRevenue + reactivationAnnualRevenue;
  const netAnnualImpact = totalAnnualImpact - AI_COST_ANNUAL;
  const roiMultiple = netAnnualImpact / AI_COST_ANNUAL;

  return {
    recoveredAnnualRevenue,
    retainedAnnualRevenue,
    reactivationAnnualRevenue,
    totalAnnualImpact,
    netAnnualImpact,
    roiMultiple,
  };
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  const rounded = Math.round(value);
  return (rounded < 0 ? "-" : "") + currencyFormatter.format(Math.abs(rounded));
}

export function initRoiCalculator() {
  const $ = (id) => document.getElementById(id);

  const numberFields = {
    missedBookingsPerMonth: $("roiMissedBookings"),
    avgRevenuePerNewCustomer: $("roiAvgNewRevenue"),
    activeCustomers: $("roiActiveCustomers"),
    avgAnnualRevenuePerRetainedCustomer: $("roiAvgRetainedRevenue"),
    inactiveCustomers: $("roiInactiveCustomers"),
    revenuePerReactivatedCustomer: $("roiRevenuePerReactivated"),
  };

  const rateFields = {
    recoveryRate: $("roiRecoveryRate"),
    currentRetentionRate: $("roiCurrentRetention"),
    expectedRetentionRate: $("roiExpectedRetention"),
    reactivationRate: $("roiReactivationRate"),
  };

  const rateOutputs = {
    recoveryRate: $("roiRecoveryRateOut"),
    currentRetentionRate: $("roiCurrentRetentionOut"),
    expectedRetentionRate: $("roiExpectedRetentionOut"),
    reactivationRate: $("roiReactivationRateOut"),
  };

  const reactivationToggle = $("roiReactivationEnabled");
  const reactivationFields = $("roiReactivationFields");
  const reactivateCard = $("roiReactivateCard");
  const netRow = document.querySelector(".roi-net-row");

  const outRecover = $("roiOutRecover");
  const outRetain = $("roiOutRetain");
  const outReactivate = $("roiOutReactivate");
  const outTotal = $("roiOutTotal");
  const outAiCost = $("roiOutAiCost");
  const outNet = $("roiOutNet");
  const outMultiple = $("roiOutMultiple");

  // Not every page that imports this module necessarily renders the
  // calculator markup (defensive, same guard style as the rest of the demo).
  if (!numberFields.missedBookingsPerMonth) return;

  function readInputs() {
    return {
      missedBookingsPerMonth: numberFields.missedBookingsPerMonth.valueAsNumber || 0,
      avgRevenuePerNewCustomer: numberFields.avgRevenuePerNewCustomer.valueAsNumber || 0,
      recoveryRate: (rateFields.recoveryRate.valueAsNumber || 0) / 100,
      activeCustomers: numberFields.activeCustomers.valueAsNumber || 0,
      currentRetentionRate: (rateFields.currentRetentionRate.valueAsNumber || 0) / 100,
      expectedRetentionRate: (rateFields.expectedRetentionRate.valueAsNumber || 0) / 100,
      avgAnnualRevenuePerRetainedCustomer: numberFields.avgAnnualRevenuePerRetainedCustomer.valueAsNumber || 0,
      reactivationEnabled: reactivationToggle.checked,
      inactiveCustomers: numberFields.inactiveCustomers.valueAsNumber || 0,
      reactivationRate: (rateFields.reactivationRate.valueAsNumber || 0) / 100,
      revenuePerReactivatedCustomer: numberFields.revenuePerReactivatedCustomer.valueAsNumber || 0,
    };
  }

  function render() {
    const inputs = readInputs();
    const result = calculateRoi(inputs);

    outRecover.textContent = formatCurrency(result.recoveredAnnualRevenue);
    outRetain.textContent = formatCurrency(result.retainedAnnualRevenue);
    outReactivate.textContent = formatCurrency(result.reactivationAnnualRevenue);
    outTotal.textContent = formatCurrency(result.totalAnnualImpact);
    outAiCost.textContent = formatCurrency(AI_COST_ANNUAL);
    outNet.textContent = formatCurrency(result.netAnnualImpact);
    outMultiple.textContent = `${result.roiMultiple.toFixed(1)}×`;

    netRow.classList.toggle("is-negative", result.netAnnualImpact < 0);
    outMultiple.classList.toggle("is-negative", result.roiMultiple < 0);

    reactivateCard.classList.toggle("is-disabled", !inputs.reactivationEnabled);
    reactivationFields.classList.toggle("is-disabled", !inputs.reactivationEnabled);
  }

  Object.entries(rateFields).forEach(([key, el]) => {
    el.addEventListener("input", () => {
      rateOutputs[key].textContent = `${el.valueAsNumber}%`;
      render();
    });
  });

  Object.values(numberFields).forEach((el) => el.addEventListener("input", render));
  reactivationToggle.addEventListener("change", render);

  render();
}

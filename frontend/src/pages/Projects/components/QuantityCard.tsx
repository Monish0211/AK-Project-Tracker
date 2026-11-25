import { Clock, Package, Plus, Trash2, Wallet, Layers } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  formatCurrencyNumber,
  formatMoney,
  formatMoneyCompact,
  isNonInrRegional,
  lineRegionalUnitRate,
  lineRegionalValue,
  rateDirectionLabel,
  regionalCurrencyOf,
  regionalWorkOrderValue,
} from "../../../utils/currencyDisplay";
import type { Project } from "../../../types/Project";
import type { QuantityItem } from "../../../types/QuantityItem";
import type { Employee } from "../../../types/EmployeeModel";
import { getEmployees, loadEmployeesForApp } from "../../../services/employeeService";
import {
  calculateQuantity,
  canRemoveQuantityItem,
  createEmptyQuantityItem,
  formatIndianNumber,
  parseNumericInput,
  recalcQuantityItem,
  calculateProjectDuration,
  UOM_OPTIONS,
} from "../../../utils/quantityCalculations";
import CommercialSummaryCard from "./CommercialSummaryCard";
import ProjectTaxCard from "./ProjectTaxCard";
import { resolveTaxMode } from "../../../utils/projectTax";
import type { PrCategoryCountryReference } from "../../../services/projectCountryImportService";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { FormLabel, RequiredAsterisk } from "../../../components/ui/FormLabel";
import { StatTile } from "../../../components/ui/StatTile";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { EmptyStateRow } from "../../../components/ui/EmptyStateRow";

import { FieldError } from "../../../components/ui/FieldError";
import { SUPPORTED_CURRENCIES } from "../../../constants/currencies";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  errors?: Record<string, string>;
  clearError?: (field: string) => void;
  /** The server's PR Category reference: which Commercial Summary (GST or Tax) a category not yet saved shows. */
  categoryReference?: PrCategoryCountryReference | null;
}

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const DESCRIPTION_PLACEHOLDERS = [
  "Pressure Gauge",
  "Temperature Sensor",
  "Calibration",
  "Inspection",
  "Valve Testing",
];

const LAST_ROW_WARNING = "At least one quantity item is required.";

// Shared with the Invoice section — see constants/currencies.ts (same seven codes as before).
const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;

const DEFAULT_CURRENCY = "INR";


interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => boolean | void;
  hasError?: boolean;
  prefix?: string;
  disabled?: boolean;
  className?: string;
}

const NumericInput = ({
  value,
  ariaLabel,
  onChange,
  hasError = false,
  prefix,
  disabled = false,
  className = "",
}: NumericInputProps) => {
  const [rawValue, setRawValue] = useState<string>(
    value === 0 ? "" : String(value)
  );

  const lastCommittedValue = useRef<number>(value);

  useEffect(() => {
    if (value !== lastCommittedValue.current) {
      lastCommittedValue.current = value;
      setRawValue(value === 0 ? "" : String(value));
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextRaw = event.target.value;

    if (nextRaw !== "" && !NUMBER_INPUT_PATTERN.test(nextRaw)) {
      return;
    }

    const parsedValue = parseNumericInput(nextRaw);
    const isAccepted = onChange(parsedValue) !== false;

    if (!isAccepted) {
      return;
    }

    lastCommittedValue.current = parsedValue;
    setRawValue(nextRaw);
  };

  const input = (
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      aria-invalid={hasError}
      value={rawValue}
      disabled={disabled}
      onChange={handleChange}
      invalid={hasError}
      className={`h-9 text-[12.5px] text-right ${prefix ? "pl-6 pr-2" : "px-2"} ${
        disabled
          ? "bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] cursor-not-allowed"
          : hasError
          ? "bg-[var(--nu-danger-soft)]"
          : ""
      } ${className}`}
    />
  );

  if (!prefix) {
    return input;
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[12px] text-[var(--nu-text-muted)]">
        {prefix}
      </span>
      {input}
    </div>
  );
};

interface AssignedToInputProps {
  value: string;
  onChange: (val: string) => void;
  ariaLabel: string;
}

const AssignedToInput = ({ value, onChange, ariaLabel }: AssignedToInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFilterQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Bug fix (Aug 2026): getEmployees() is a pure localStorage read — it only
  // has data once something has already called loadEmployeesForApp() to
  // hydrate that mirror from PostgreSQL. This field can be reached without
  // the user ever having visited Manpower in this session, so it must
  // trigger its own load — same fix as ProjectLeadershipCard.tsx and
  // PmoAssistant.tsx for the identical symptom. Seeded from getEmployees()
  // so an already-hydrated mirror renders immediately.
  const [masterEmployees, setMasterEmployees] = useState<Employee[]>(() => getEmployees());

  useEffect(() => {
    let isMounted = true;
    loadEmployeesForApp()
      .then((result) => {
        if (isMounted) setMasterEmployees(result.employees);
      })
      .catch(() => {
        /* keep whatever the mirror already had — best-effort */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Bug fix (Aug 2026): used to suggest the distinct set of
  // Employee.reportingManager VALUES (i.e. "people who happen to already be
  // listed as someone else's manager") — never the actual employee roster.
  // Now sources real employeeName values from the full Employee Master —
  // NOT restricted to Manager/Team Lead designations. Quantity Assigned To
  // answers "who is doing this engineering activity," a different question
  // from Project Leadership's "who manages/leads the project" (see
  // ProjectLeadershipCard.tsx's isEligibleManagerDesignation() usage for
  // that separate, intentionally-restricted field) — any legitimate active
  // employee (Trainee, Engineer, Senior Engineer, Manager, ... ) must be
  // assignable here, same unfiltered roster Project Coordinator/Project
  // Engineer already use.
  const assigneeNames = useMemo<string[]>(() => {
    const list = masterEmployees
      .map((emp) => emp.employeeName?.trim())
      .filter((name): name is string => typeof name === "string" && name !== "");
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [masterEmployees]);

  const suggestions = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return assigneeNames
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 5); // Capped at 5 suggestions, no scrollbars needed
  }, [filterQuery, assigneeNames]);

  const showDropdown = isOpen && filterQuery.trim() !== "" && suggestions.length > 0;

  const selectOption = (name: string) => {
    setFilterQuery(name);
    onChange(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          selectOption(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFilterQuery(val);
    onChange(val);
    if (val.trim() === "") {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  const handleFocus = () => {
    if (filterQuery.trim() !== "") {
      setIsOpen(true);
      setHighlightedIndex(0);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full text-left">
      <Input
        type="text"
        value={filterQuery}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        className="h-9 px-2 text-[12.5px]"
        placeholder="Type manager name..."
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] py-1 shadow-[var(--nu-shadow-md)] overflow-hidden animate-in fade-in duration-100">
          {suggestions.map((name, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <button
                key={name}
                type="button"
                onClick={() => selectOption(name)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] transition-colors duration-100 ${
                  isHighlighted
                    ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] font-semibold"
                    : "text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-accent)]"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const QuantityCard = ({ project, setProject, errors = {}, clearError, categoryReference }: Props) => {
  const handleDescriptionChange = useCallback(
    (index: number, value: string) => {
      clearError?.(`qty_desc_${index}`);
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item, i) =>
          i === index ? { ...item, description: value } : item
        );

        return {
          ...prev,
          quantityItems: updatedItems,
        };
      });
    },
    [setProject]
  );

  const handleFieldChange = useCallback(
    (index: number, field: "woQty" | "unitRate" | "uom" | "assignedTo", value: string | number) => {
      if (field === "woQty") clearError?.(`qty_qty_${index}`);
      if (field === "uom") clearError?.(`qty_uom_${index}`);
      if (field === "unitRate") clearError?.(`qty_rate_${index}`);

      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item, i) => {
          if (i !== index) return item;
          let updatedItem = { ...item };
          if (field === "woQty") {
            updatedItem.woQty = Number(value);
          } else if (field === "unitRate") {
            updatedItem.unitRate = Number(value);
          } else if (field === "uom") {
            updatedItem.uom = String(value);
            if (updatedItem.uom === "LUMP SUM") {
              updatedItem.woQty = 1;
            }
          } else if (field === "assignedTo") {
            updatedItem.assignedTo = String(value);
          }
          return recalcQuantityItem(updatedItem, prev.currency, prev.currentExchangeRate, prev.regionalCurrency);
        });

        const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate, prev.gstApplicable, prev.regionalCurrency);

        return {
          ...prev,
          quantityItems: updatedItems,
          ...totals,
          totalProjectBudget: totals.workOrderValueINR,
        };
      });

      return true;
    },
    [setProject]
  );

  const handleProjectCurrencyChange = useCallback(
    (currency: string) => {
      setProject((prev) => {
        const regional = prev.regionalCurrency || DEFAULT_CURRENCY;
        // The regional currency is always rate 1 (read-only). Any other currency starts with NO rate, so a rate typed for the previous
        // currency can never carry over: the user enters it as "1 <currency> = X <regional currency>".
        const nextExchangeRate = currency === regional ? 1 : currency === prev.currency ? prev.currentExchangeRate : 0;
        const updatedItems = prev.quantityItems.map((item) =>
          recalcQuantityItem(item, currency, nextExchangeRate, prev.regionalCurrency)
        );
        const totals = calculateQuantity(updatedItems, currency, nextExchangeRate, prev.gstApplicable, prev.regionalCurrency);

        return {
          ...prev,
          currency,
          currentExchangeRate: nextExchangeRate,
          contractExchangeRate: nextExchangeRate,
          quantityItems: updatedItems,
          ...totals,
          totalProjectBudget: totals.workOrderValueINR,
        };
      });
    },
    [setProject]
  );

  const handleProjectExchangeRateChange = useCallback(
    (exchangeRate: number) => {
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item) =>
          recalcQuantityItem(item, prev.currency, exchangeRate, prev.regionalCurrency)
        );
        const totals = calculateQuantity(updatedItems, prev.currency, exchangeRate, prev.gstApplicable, prev.regionalCurrency);

        return {
          ...prev,
          currentExchangeRate: exchangeRate,
          contractExchangeRate: exchangeRate,
          quantityItems: updatedItems,
          ...totals,
          totalProjectBudget: totals.workOrderValueINR,
        };
      });
    },
    [setProject]
  );

  const handleAddItem = useCallback(() => {
    setProject((prev) => {
      const newItem: QuantityItem = createEmptyQuantityItem(
        prev.currency,
        prev.currentExchangeRate,
        prev.regionalCurrency
      );

      const updatedItems = [...prev.quantityItems, newItem];
      const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate, false, prev.regionalCurrency);

      return {
        ...prev,
        quantityItems: updatedItems,
        ...totals,
        totalProjectBudget: totals.workOrderValueINR,
      };
    });
  }, [setProject]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      setProject((prev) => {
        if (!canRemoveQuantityItem(prev.quantityItems)) {
          return prev;
        }

        const updatedItems = prev.quantityItems.filter((_, i) => i !== index);
        const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate, prev.gstApplicable, prev.regionalCurrency);

        return {
          ...prev,
          quantityItems: updatedItems,
          ...totals,
          totalProjectBudget: totals.workOrderValueINR,
        };
      });
    },
    [setProject]
  );

  const handleGstApplicableChange = useCallback(
    (gstApplicable: boolean) => {
      setProject((prev) => {
        const totals = calculateQuantity(
          prev.quantityItems,
          prev.currency,
          prev.currentExchangeRate,
          gstApplicable,
          prev.regionalCurrency
        );

        return {
          ...prev,
          gstApplicable,
          ...totals,
          totalProjectBudget: totals.workOrderValueINR,
        };
      });
    },
    [setProject]
  );

  // Project Tax (outside India): only the two settings are state - the card derives the amounts from the regional Work Order Value.
  const handleTaxApplicableChange = useCallback(
    (taxApplicable: boolean) => {
      setProject((prev) => ({ ...prev, taxApplicable }));
      clearError?.("taxRatePercent");
    },
    [setProject, clearError]
  );

  const handleTaxRateChange = useCallback(
    (taxRatePercent: number | null) => {
      setProject((prev) => ({ ...prev, taxRatePercent }));
      clearError?.("taxRatePercent");
    },
    [setProject, clearError]
  );

  // Phase 3: the project's regional currency (INR for a legacy project) and whether the chosen currency IS the regional one (rate 1, read-only).
  const regionalCurrency = regionalCurrencyOf(project);
  const nonInrRegional = isNonInrRegional(project);
  const isRegionalCurrency = (project.currency || DEFAULT_CURRENCY) === regionalCurrency;
  const projectDuration = calculateProjectDuration(
    project.projectStartDate,
    project.projectEndDate
  );

  // UOM summary badges (display only — same calculation as before)
  const uomGroups: Record<string, number> = {};
  project.quantityItems.forEach((item) => {
    const uom = (item.uom || "DAY").trim().toUpperCase();
    uomGroups[uom] = (uomGroups[uom] || 0) + (item.woQty || 0);
  });

  const UOM_SORT_ORDER = [
    "LUMP SUM",
    "MAN-HOUR",
    "MAN-DAY",
    "DAY",
    "MONTH",
    "VISIT",
    "PERSON",
    "JOB",
    "PACKAGE",
    "NOS",
    "LOT",
    "SET",
    "TRIP",
  ];

  const sortedUomEntries = Object.entries(uomGroups).sort(([a], [b]) => {
    const idxA = UOM_SORT_ORDER.indexOf(a);
    const idxB = UOM_SORT_ORDER.indexOf(b);
    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <StatTile
          emphasis="secondary"
          label="Activities"
          value={formatIndianNumber(project.quantityItems.length)}
          icon={<Package size={14} />}
          tint="accent"
        />
        <StatTile
          emphasis="secondary"
          label="Project Duration"
          value={projectDuration || "—"}
          icon={<Clock size={14} />}
          tint="warning"
        />
        <StatTile
          emphasis="secondary"
          label="Total WO Value"
          value={formatMoneyCompact(regionalWorkOrderValue(project), regionalCurrency)}
          icon={<Wallet size={14} />}
          tint="success"
        />
        <StatTile
          emphasis="secondary"
          label="Currency"
          value={isRegionalCurrency ? project.currency || DEFAULT_CURRENCY : `${project.currency} → ${regionalCurrency}`}
          icon={<Layers size={14} />}
          tint="info"
        />
      </div>

      {sortedUomEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] mr-1">
            UOM Summary
          </span>
          {sortedUomEntries.map(([uom, qty]) => (
            <span
              key={uom}
              className="inline-flex items-center gap-1.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--nu-text-secondary)] shadow-[var(--nu-shadow-sm)]"
            >
              <span>{uom}</span>
              <span className="h-3 w-px bg-[var(--nu-border)]" />
              <span className="font-bold text-[var(--nu-text)]">{formatIndianNumber(qty)}</span>
            </span>
          ))}
        </div>
      )}

      <Card padded={false} elevated>
        <CardHeader
          icon={<Layers size={15} />}
          title="Quantity Details"
          subtitle="Engineering activities, quantities and assignment"
          action={
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={handleAddItem}>
              Add Activity
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {/* Top-aligned: the Exchange Rate column is taller (a helper line under the field), and bottom-aligning dropped the Currency label below the Exchange Rate label. */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-32">
              <FormLabel required={true} className="mb-1 !text-[11px] uppercase">
                Currency
              </FormLabel>
              <Select
                data-field="currency"
                value={project.currency || DEFAULT_CURRENCY}
                onChange={(e) => {
                  handleProjectCurrencyChange(e.target.value);
                  clearError?.("currency");
                }}
                invalid={!!errors["currency"]}
                className="h-9 px-2 text-[12.5px]"
              >
                {CURRENCY_OPTIONS.map((currencyOption) => (
                  <option key={currencyOption} value={currencyOption}>
                    {currencyOption}
                  </option>
                ))}
              </Select>
              <FieldError error={errors["currency"]} />
            </div>

            <div className="w-56">
              <FormLabel required={!isRegionalCurrency} className="mb-1 !text-[11px] uppercase">
                Exchange Rate
              </FormLabel>
              <div data-field="exchangeRate">
                <NumericInput
                  value={project.currentExchangeRate}
                  ariaLabel="Project Exchange Rate"
                  disabled={isRegionalCurrency}
                  onChange={(value) => {
                    handleProjectExchangeRateChange(value);
                    clearError?.("exchangeRate");
                  }}
                  className={errors["exchangeRate"] ? "!border-[var(--nu-danger)]" : ""}
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--nu-text-muted)]" data-testid="exchange-rate-direction">
                {isRegionalCurrency
                  ? `Regional currency (${regionalCurrency}): rate fixed at 1`
                  : rateDirectionLabel(project.currency, regionalCurrency, project.currentExchangeRate)}
              </p>
              {!isRegionalCurrency && project.currentExchangeRate === 1 && (
                <p className="mt-0.5 text-[11px] text-[var(--nu-warning)]" data-testid="exchange-rate-one-warning">
                  A rate of exactly 1 is unusual for {project.currency} to {regionalCurrency}. Please confirm it.
                </p>
              )}
              <FieldError error={errors["exchangeRate"]} />
            </div>
          </div>

          <div className="max-h-[26rem] min-h-[200px] overflow-auto nu-scrollbar rounded-[var(--nu-radius-md)] border border-[var(--nu-border)]">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)]">
                <tr>
                  <th className="nu-table-th w-12 border-b border-[var(--nu-border)] px-2 py-2 text-center font-medium sticky left-0 z-20 bg-[var(--nu-surface-alt)]">
                    Sl
                  </th>
                  <th className="nu-table-th border-b border-[var(--nu-border)] px-2 py-2 text-left font-medium">
                    Description <RequiredAsterisk />
                  </th>
                  <th className="nu-table-th w-20 border-b border-[var(--nu-border)] px-2 py-2 text-right font-medium">
                    Qty <RequiredAsterisk />
                  </th>
                  <th className="nu-table-th w-28 border-b border-[var(--nu-border)] px-2 py-2 text-center font-medium">
                    UOM <RequiredAsterisk />
                  </th>
                  <th className="nu-table-th w-24 border-b border-[var(--nu-border)] px-2 py-2 text-right font-medium">
                    Unit Rate <RequiredAsterisk />
                  </th>
                  <th className="nu-table-th w-28 border-b border-[var(--nu-border)] px-2 py-2 text-right font-medium">
                    Rate ({regionalCurrency})
                  </th>
                  <th className="nu-table-th w-32 border-b border-[var(--nu-border)] px-2 py-2 text-right font-medium">
                    WO Value
                  </th>
                  <th className="nu-table-th w-44 border-b border-[var(--nu-border)] px-2 py-2 text-left font-medium">
                    Assigned To
                  </th>
                  <th className="nu-table-th w-14 border-b border-[var(--nu-border)] px-2 py-2 text-center font-medium">
                    Del
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--nu-border)]">
                {project.quantityItems.length === 0 ? (
                  <EmptyStateRow
                    colSpan={9}
                    title="No activities added"
                    description='Click "Add Activity" to get started.'
                  />
                ) : (
                  project.quantityItems.map((item, index) => {
                    const canRemove = canRemoveQuantityItem(project.quantityItems);
                    return (
                      <tr
                        key={item.id}
                        className="nu-table-row bg-[var(--nu-surface)] hover:bg-[var(--nu-surface-alt)] transition-colors"
                      >
                        <td className="px-2 py-2 text-center text-[var(--nu-text-muted)] sticky left-0 z-10 bg-[var(--nu-surface)]">
                          {index + 1}
                        </td>

                        <td className="px-2 py-2 align-top">
                          <Input
                            type="text"
                            data-field={`qty_desc_${index}`}
                            value={item.description}
                            placeholder={
                              DESCRIPTION_PLACEHOLDERS[
                                index % DESCRIPTION_PLACEHOLDERS.length
                              ]
                            }
                            aria-label={`Description for row ${index + 1}`}
                            onChange={(e) =>
                              handleDescriptionChange(index, e.target.value)
                            }
                            invalid={!!errors[`qty_desc_${index}`]}
                            className="h-9 px-2 text-[12.5px]"
                          />
                          <FieldError error={errors[`qty_desc_${index}`]} />
                        </td>

                        <td className="px-2 py-2 align-top">
                          <div data-field={`qty_qty_${index}`}>
                            <NumericInput
                              value={item.woQty}
                              ariaLabel={`Quantity for row ${index + 1}`}
                              onChange={(value) =>
                                handleFieldChange(index, "woQty", value)
                              }
                              className={errors[`qty_qty_${index}`] ? "!border-[var(--nu-danger)]" : ""}
                            />
                          </div>
                          <FieldError error={errors[`qty_qty_${index}`]} />
                        </td>

                        <td className="px-2 py-2 align-top">
                          <Select
                            data-field={`qty_uom_${index}`}
                            value={item.uom || "DAY"}
                            aria-label={`UOM for row ${index + 1}`}
                            onChange={(e) =>
                              handleFieldChange(index, "uom", e.target.value)
                            }
                            invalid={!!errors[`qty_uom_${index}`]}
                            className="h-9 px-1.5 text-[12.5px]"
                          >
                            {UOM_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                          <FieldError error={errors[`qty_uom_${index}`]} />
                        </td>

                        <td className="px-2 py-2 align-top">
                          <div data-field={`qty_rate_${index}`}>
                            <NumericInput
                              value={item.unitRate}
                              ariaLabel={`Unit Rate for row ${index + 1}`}
                              onChange={(value) =>
                                handleFieldChange(index, "unitRate", value)
                              }
                              className={errors[`qty_rate_${index}`] ? "!border-[var(--nu-danger)]" : ""}
                            />
                          </div>
                          <FieldError error={errors[`qty_rate_${index}`]} />
                        </td>

                        <td className="px-2 py-2 text-right">
                          <span className="inline-flex rounded-full bg-[var(--nu-surface-alt)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--nu-text-secondary)]">
                            {nonInrRegional ? formatCurrencyNumber(lineRegionalUnitRate(item, project), regionalCurrency) : formatIndianNumber(item.unitRateINR)}
                          </span>
                        </td>

                        <td className="px-2 py-2 text-right font-bold text-[var(--nu-success)]">
                          {formatMoney(lineRegionalValue(item, project), regionalCurrency)}
                        </td>

                        <td className="px-2 py-2">
                          <AssignedToInput
                            value={item.assignedTo || ""}
                            onChange={(val) =>
                              handleFieldChange(index, "assignedTo", val)
                            }
                            ariaLabel={`Assigned to employee for row ${index + 1}`}
                          />
                        </td>

                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            disabled={!canRemove}
                            aria-label={
                              canRemove
                                ? `Delete row ${index + 1}`
                                : LAST_ROW_WARNING
                            }
                            title={canRemove ? "Delete row" : LAST_ROW_WARNING}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--nu-shadow-sm)] disabled:opacity-30 disabled:cursor-not-allowed disabled:translate-y-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {project.quantityItems.length === 1 && (
            <p className="text-[11px] font-medium text-[var(--nu-text-muted)]">
              {LAST_ROW_WARNING}
            </p>
          )}
        </CardBody>
      </Card>

      {resolveTaxMode(project, categoryReference) === "TAX" ? (
        <ProjectTaxCard
          key={project.id}
          currency={regionalCurrency}
          workOrderValue={regionalWorkOrderValue(project)}
          applicable={project.taxApplicable}
          ratePercent={project.taxRatePercent}
          editable
          rateError={errors["taxRatePercent"]}
          onApplicableChange={handleTaxApplicableChange}
          onRateChange={handleTaxRateChange}
        />
      ) : (
        <CommercialSummaryCard
          currency={project.currency}
          workOrderValueINR={project.workOrderValueINR}
          regionalCurrency={project.regionalCurrency}
          workOrderValueRegional={project.workOrderValueRegional}
          grandTotalRegional={project.grandTotalRegional}
          gstApplicable={project.gstApplicable}
          gstRate={project.gstRate}
          gstAmount={project.gstAmount}
          grandTotal={project.grandTotal}
          editable
          onGstApplicableChange={handleGstApplicableChange}
        />
      )}
    </div>
  );
};

export default QuantityCard;

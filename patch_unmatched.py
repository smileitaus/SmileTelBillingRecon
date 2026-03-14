#!/usr/bin/env python3
"""Patch UnmatchedServices.tsx to add SM suggestion panel and Create New Customer button."""

import re

with open('client/src/pages/UnmatchedServices.tsx', 'r') as f:
    content = f.read()

# 1. Add SM suggestion panel before "Suggested Matches" section
old_section = '      {/* Suggested Matches - hide for terminated services */}\n      {!isTerminated && ('
new_section = '''      {/* SM Import Suggestion Panel */}
      {smSuggestedName && !isTerminated && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              SM Import Suggestion
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-300 font-medium ml-1">
              &ldquo;{smSuggestedName}&rdquo;
            </span>
          </div>
          {smSuggestionsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Finding matching customers...
            </div>
          ) : smSuggestions && smSuggestions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Possible matches — select to assign:</p>
              {smSuggestions.map((s: any) => (
                <div
                  key={s.externalId}
                  className="flex items-center justify-between bg-white dark:bg-background rounded-md border border-blue-200 dark:border-blue-700 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.serviceCount} services &middot; {s.confidence}% match
                    </p>
                  </div>
                  <button
                    onClick={() => handleAssign(s.externalId, s.name)}
                    disabled={assignMutation.isPending}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 ml-2"
                  >
                    {assigningCustomerId === s.externalId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    Assign
                  </button>
                </div>
              ))}
              <button
                onClick={() => { setCreateCustomerName(smSuggestedName); setShowCreateCustomer(true); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors mt-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                None match &mdash; Create &ldquo;{smSuggestedName}&rdquo; as new customer
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">No existing customers match this name.</p>
              <button
                onClick={() => { setCreateCustomerName(smSuggestedName); setShowCreateCustomer(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create &ldquo;{smSuggestedName}&rdquo; as new customer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Customer Dialog */}
      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        suggestedName={createCustomerName}
        onCreated={(externalId, name) => {
          handleAssign(externalId, name);
        }}
      />

      {/* Suggested Matches - hide for terminated services */}
      {!isTerminated && ('''

if old_section in content:
    content = content.replace(old_section, new_section, 1)
    print("✅ Added SM suggestion panel")
else:
    print("❌ Could not find 'Suggested Matches' section")

# 2. Add "Create New Customer" button in the "No customers found" state
old_no_results = '''                    <div className="flex flex-col items-center py-6 text-muted-foreground">
                      <Search className="w-5 h-5 mb-2 opacity-50" />
                      <p className="text-sm">
                        No customers found for "{customerSearch}"
                      </p>
                      <p className="text-xs mt-1">
                        Try a different name, phone number, or AVC ID
                      </p>
                    </div>'''

new_no_results = '''                    <div className="flex flex-col items-center py-6 text-muted-foreground gap-3">
                      <Search className="w-5 h-5 opacity-50" />
                      <div className="text-center">
                        <p className="text-sm">
                          No customers found for &ldquo;{customerSearch}&rdquo;
                        </p>
                        <p className="text-xs mt-1">
                          Try a different name, phone number, or AVC ID
                        </p>
                      </div>
                      <button
                        onClick={() => { setCreateCustomerName(customerSearch); setShowCreateCustomer(true); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Create &ldquo;{customerSearch}&rdquo; as new customer
                      </button>
                    </div>'''

if old_no_results in content:
    content = content.replace(old_no_results, new_no_results, 1)
    print("✅ Added Create New Customer button in no-results state")
else:
    print("❌ Could not find 'No customers found' section")

with open('client/src/pages/UnmatchedServices.tsx', 'w') as f:
    f.write(content)

print("Done!")

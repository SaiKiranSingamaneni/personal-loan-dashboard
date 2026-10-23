import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AllLoansOverview, App, DataManagementPage, EmiCalculatorPage, LoanFormPage, LoanRoute, TrashPage } from "./App.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<AllLoansOverview />} />
            <Route path="loans/new" element={<LoanFormPage />} />
            <Route path="loans/:loanId/edit" element={<LoanFormPage />} />
            <Route path="loans/:loanId" element={<LoanRoute />} />
            <Route path="calculator" element={<EmiCalculatorPage />} />
            <Route path="data" element={<DataManagementPage />} />
            <Route path="trash" element={<TrashPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

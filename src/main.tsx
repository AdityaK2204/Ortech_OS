import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ProjectsProvider } from './store/ProjectsContext';
import { MeasurementsProvider } from './store/MeasurementsContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ProjectsProvider>
          <MeasurementsProvider>
            <App />
          </MeasurementsProvider>
        </ProjectsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

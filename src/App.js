import React, { useEffect, useState } from 'react';
import { AppBar, Box, Container, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import "./style.css";
import Dashboard from './components/Dashboard';
import ToolsHub from './components/ToolsHub';
import VcfGenerator from './components/VcfGenerator';
import SendContactCardWorkflow from './components/SendContactCardWorkflow';

// Hash routes: #/ (dashboard), #/tools, #/tools/<tool-id>
const parseHash = () => {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] === 'tools' ? 'tools' : 'dashboard', toolId: parts[1] || null };
};

export default function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (path) => {
    window.location.hash = path;
  };
  const openTool = (toolId) => navigate(`/tools/${toolId}`);
  const backToTools = () => navigate('/tools');

  let content;
  if (route.section === 'dashboard') {
    content = <Dashboard />;
  } else if (route.toolId === 'vcf-generator') {
    content = <VcfGenerator onBack={backToTools} />;
  } else if (route.toolId === 'send-contact-card') {
    content = <SendContactCardWorkflow onBack={backToTools} onOpenTool={openTool} />;
  } else {
    content = <ToolsHub onOpenTool={openTool} />;
  }

  return (
    <>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AgencyView
          </Typography>
          <Tabs
            value={route.section}
            onChange={(event, value) => navigate(value === 'tools' ? '/tools' : '/')}
          >
            <Tab label="Dashboard" value="dashboard" />
            <Tab label="Free Agent Tools" value="tools" />
          </Tabs>
        </Toolbar>
      </AppBar>
      {route.section === 'dashboard' ? (
        content
      ) : (
        <Container maxWidth="lg">
          <Box sx={{ my: 4 }}>{content}</Box>
        </Container>
      )}
    </>
  );
}

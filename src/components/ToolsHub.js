import React from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Grid,
  Typography,
} from '@mui/material';
import { TOOLS } from '../tools/registry';

const ToolsHub = ({ onOpenTool }) => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        AgencyView Free Agent Tools
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Free tools to help insurance agents stay in their clients' phones and inboxes.
      </Typography>
      <Grid container spacing={2}>
        {TOOLS.map((tool) => (
          <Grid size={{ xs: 12, md: 6 }} key={tool.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Chip label={tool.category} size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />
                <Typography variant="h6" component="h2" gutterBottom>
                  {tool.title}
                </Typography>
                <Typography color="text.secondary">{tool.description}</Typography>
              </CardContent>
              <CardActions>
                <Button variant="contained" onClick={() => onOpenTool(tool.id)}>
                  {tool.cta}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ToolsHub;

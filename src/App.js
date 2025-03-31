import React, { useState, useEffect } from "react";
import axios from 'axios';
import { Container, Grid, Box } from '@mui/material';
import "./style.css";
import USMap from './components/USMap';
import StatsCard from './components/StatsCard';
import SubmissionList from './components/SubmissionList';

export default function App() {
  const [stats, setStats] = useState({
    totalSubmissions: 0,
    todaySubmissions: 0,
    newContacts: 0,
    topState: '',
  });
  const [stateData, setStateData] = useState({});
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Replace with your actual API endpoint and authentication
        const headers = {
          'Authorization': `Bearer ${process.env.REACT_APP_API_KEY}`,
          'Content-Type': 'application/json',
        };

        const response = await axios.get('YOUR_API_ENDPOINT/submissions', { headers });
        
        // Process the data
        const today = new Date().toISOString().split('T')[0];
        const submissionsData = response.data;
        
        // Calculate stats
        const todaySubmissions = submissionsData.filter(s => 
          s.createdAt.startsWith(today)
        ).length;

        const stateCount = submissionsData.reduce((acc, curr) => {
          acc[curr.state] = (acc[curr.state] || 0) + 1;
          return acc;
        }, {});

        const topState = Object.entries(stateCount)
          .sort(([,a], [,b]) => b - a)[0][0];

        setStats({
          totalSubmissions: submissionsData.length,
          todaySubmissions,
          newContacts: submissionsData.filter(s => s.isNewContact).length,
          topState,
        });

        setStateData(stateCount);
        setSubmissions(submissionsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    // Set up polling every 5 minutes
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <StatsCard title="Total Submissions" value={stats.totalSubmissions} />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatsCard title="Today's Submissions" value={stats.todaySubmissions} />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatsCard title="New Contacts" value={stats.newContacts} />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatsCard title="Top State" value={stats.topState} />
          </Grid>
        </Grid>

        <Box sx={{ my: 4 }}>
          <USMap data={stateData} />
        </Box>

        <Box sx={{ my: 4 }}>
          <SubmissionList submissions={submissions} />
        </Box>
      </Box>
    </Container>
  );
}
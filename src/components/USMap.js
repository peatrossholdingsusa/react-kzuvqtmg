import React, { useEffect, useMemo, useState } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import { feature } from 'topojson-client';

const USMap = ({ data }) => {
  const [states, setStates] = useState([]);

  useEffect(() => {
    // Load US map data
    fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
      .then(response => response.json())
      .then(us => setStates(feature(us, us.objects.states).features))
      .catch(error => console.error('Error loading map:', error));
  }, []);

  const path = useMemo(
    () => geoPath(geoAlbersUsa().scale(1000).translate([400, 300])),
    []
  );

  // Create color scale
  const colorScale = scaleLinear()
    .domain([0, Math.max(1, ...Object.values(data))])
    .range(['#f7fbff', '#08519c']);

  return (
    <svg width={800} height={600}>
      <g className="states">
        {states.map((d) => {
          const stateName = d.properties.name;
          return (
            <path
              key={d.id || stateName}
              d={path(d)}
              fill={data[stateName] ? colorScale(data[stateName]) : '#eee'}
              stroke="#fff"
              strokeWidth={0.5}
            />
          );
        })}
      </g>
    </svg>
  );
};

export default USMap;

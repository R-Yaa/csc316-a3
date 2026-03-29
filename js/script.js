const margin = { top: 20, right: 30, bottom: 40, left: 60 };
const chartHeight = 460;

const colors = {
    all: "#475569",
    food: "#10b981",
    shelter: "#3b82f6",
    transportation: "#8b5cf6"
};

const prettyNames = {
    all: "All-Items",
    food: "Food",
    shelter: "Shelter",
    transportation: "Transportation"
};

let rawData = [];
let groupedData = new Map();
let years = [];
let categories = [];

let svg, chartGroup, xScale, yScale, xAxisGroup, yAxisGroup, gridGroup, zeroLine;
let lineGroup, hoverGroup, hoverLine, hoverDots, overlayRect, tooltip;
let selectedYearGroup, selectedYearLine, selectedYearDots;
let chartWidth = 0;

const chartContainer = d3.select("#chart");
const legendContainer = d3.select("#legend");
const categoryCards = d3.select("#categoryCards");

const yearSlider = document.getElementById("yearSlider");
const yearLabel = document.getElementById("yearLabel");
const officialRate = document.getElementById("officialRate");

const housingSlider = document.getElementById("housingSlider");
const foodSlider = document.getElementById("foodSlider");
const transportSlider = document.getElementById("transportSlider");
const otherSlider = document.getElementById("otherSlider");

const housingInput = document.getElementById("housingInput");
const foodInput = document.getElementById("foodInput");
const transportInput = document.getElementById("transportInput");
const otherInput = document.getElementById("otherInput");

const housingValue = document.getElementById("housingValue");
const foodValue = document.getElementById("foodValue");
const transportValue = document.getElementById("transportValue");
const otherValue = document.getElementById("otherValue");
const weightTotalNote = document.getElementById("weightTotalNote");

const officialBar = document.getElementById("officialBar");
const personalBar = document.getElementById("personalBar");
const officialBarLabel = document.getElementById("officialBarLabel");
const personalBarLabel = document.getElementById("personalBarLabel");
const comparisonText = document.getElementById("comparisonText");

const weightControls = [
    {
        key: "shelter",
        slider: housingSlider,
        input: housingInput,
        valueEl: housingValue
    },
    {
        key: "food",
        slider: foodSlider,
        input: foodInput,
        valueEl: foodValue
    },
    {
        key: "transportation",
        slider: transportSlider,
        input: transportInput,
        valueEl: transportValue
    },
    {
        key: "other",
        slider: otherSlider,
        input: otherInput,
        valueEl: otherValue
    }
];

d3.csv("data/inflation_cleaned.csv", d => ({
    year: +d.year,
    category: d.category.trim().toLowerCase(),
    value: +d.value
})).then(data => {
    rawData = data
        .filter(d => !Number.isNaN(d.year) && !Number.isNaN(d.value))
        .sort((a, b) => a.year - b.year);

    groupedData = d3.group(rawData, d => d.category);

    categories = ["all", "shelter", "food", "transportation"].filter(c => groupedData.has(c));
    years = Array.from(new Set(rawData.map(d => d.year))).sort((a, b) => a - b);

    setupControls();
    setupChart();
    renderLegend();
    updateAll();

    window.addEventListener("resize", handleResize);
});

function setupControls() {
    yearSlider.min = years[0];
    yearSlider.max = years[years.length - 1];
    yearSlider.step = 1;
    yearSlider.value = years[years.length - 1];

    yearSlider.addEventListener("input", () => {
        updateSelectedYear(+yearSlider.value);
    });

    updateYearLabel();
    setupWeightSliders();
    syncInputsAndLabels();
}

function setupWeightSliders() {
    weightControls.forEach(control => {
        control.slider.addEventListener("input", () => {
            applyWeightChange(control.key, clampValue(control.slider.value));
        });

        control.input.addEventListener("input", () => {
            const parsed = clampValue(control.input.value === "" ? 0 : control.input.value);
            applyWeightChange(control.key, parsed);
        });

        control.input.addEventListener("blur", () => {
            const parsed = clampValue(control.input.value === "" ? 0 : control.input.value);
            applyWeightChange(control.key, parsed);
        });
    });
}

function clampValue(value) {
    return Math.max(0, Math.min(100, Math.round(+value || 0)));
}

function getWeights() {
    return {
        shelter: +housingSlider.value,
        food: +foodSlider.value,
        transportation: +transportSlider.value,
        other: +otherSlider.value
    };
}

function setWeights(weights) {
    housingSlider.value = weights.shelter;
    foodSlider.value = weights.food;
    transportSlider.value = weights.transportation;
    otherSlider.value = weights.other;

    housingInput.value = weights.shelter;
    foodInput.value = weights.food;
    transportInput.value = weights.transportation;
    otherInput.value = weights.other;

    syncInputsAndLabels();
}

function syncInputsAndLabels() {
    housingValue.textContent = `${housingSlider.value}%`;
    foodValue.textContent = `${foodSlider.value}%`;
    transportValue.textContent = `${transportSlider.value}%`;
    otherValue.textContent = `${otherSlider.value}%`;

    housingInput.value = housingSlider.value;
    foodInput.value = foodSlider.value;
    transportInput.value = transportSlider.value;
    otherInput.value = otherSlider.value;

    const total =
        +housingSlider.value +
        +foodSlider.value +
        +transportSlider.value +
        +otherSlider.value;

    weightTotalNote.textContent = `Total: ${total}%`;
}

function applyWeightChange(changedKey, newValue) {
    const weights = getWeights();
    const oldValue = weights[changedKey];
    const delta = newValue - oldValue;

    if (delta === 0) {
        setWeights(weights);
        updateComparison();
        return;
    }

    weights[changedKey] = newValue;

    const otherKeys = Object.keys(weights).filter(k => k !== changedKey);

    if (delta > 0) {
        let remainingToRemove = delta;

        const sortedOthers = otherKeys
            .map(key => ({ key, value: weights[key] }))
            .sort((a, b) => b.value - a.value);

        sortedOthers.forEach(item => {
            if (remainingToRemove <= 0) return;
            const reduction = Math.min(weights[item.key], remainingToRemove);
            weights[item.key] -= reduction;
            remainingToRemove -= reduction;
        });

        if (remainingToRemove > 0) {
            weights[changedKey] = newValue - remainingToRemove;
        }
    } else {
        let amountToAdd = Math.abs(delta);

        const sortedOthers = otherKeys
            .map(key => ({ key, space: 100 - weights[key] }))
            .sort((a, b) => b.space - a.space);

        let totalSpace = d3.sum(sortedOthers, d => d.space);

        if (totalSpace === 0) {
            weights[changedKey] = oldValue;
        } else {
            let assigned = 0;

            sortedOthers.forEach((item, i) => {
                if (i === sortedOthers.length - 1) {
                    const add = Math.min(item.space, amountToAdd - assigned);
                    weights[item.key] += add;
                    assigned += add;
                } else {
                    const proportionalAdd = Math.min(
                        item.space,
                        Math.round((item.space / totalSpace) * amountToAdd)
                    );
                    weights[item.key] += proportionalAdd;
                    assigned += proportionalAdd;
                }
            });

            let leftover = amountToAdd - assigned;

            if (leftover > 0) {
                sortedOthers.forEach(item => {
                    if (leftover <= 0) return;
                    const room = 100 - weights[item.key];
                    const add = Math.min(room, leftover);
                    weights[item.key] += add;
                    leftover -= add;
                });
            }
        }
    }

    normalizeWeights(weights, changedKey);
    setWeights(weights);
    updateComparison();
}

function normalizeWeights(weights, priorityKey) {
    const keys = Object.keys(weights);

    keys.forEach(key => {
        weights[key] = clampValue(weights[key]);
    });

    let total = d3.sum(keys, key => weights[key]);

    if (total === 100) return;

    if (total < 100) {
        let deficit = 100 - total;
        const candidates = keys.filter(key => key !== priorityKey).sort((a, b) => weights[a] - weights[b]);

        for (const key of candidates) {
            if (deficit <= 0) break;
            const room = 100 - weights[key];
            const add = Math.min(room, deficit);
            weights[key] += add;
            deficit -= add;
        }

        if (deficit > 0) {
            weights[priorityKey] += deficit;
        }
    } else {
        let excess = total - 100;
        const candidates = keys.filter(key => key !== priorityKey).sort((a, b) => weights[b] - weights[a]);

        for (const key of candidates) {
            if (excess <= 0) break;
            const remove = Math.min(weights[key], excess);
            weights[key] -= remove;
            excess -= remove;
        }

        if (excess > 0) {
            weights[priorityKey] = Math.max(0, weights[priorityKey] - excess);
        }
    }
}

function setupChart() {
    chartWidth = chartContainer.node().getBoundingClientRect().width - margin.left - margin.right;

    svg = chartContainer.append("svg")
        .attr("width", chartWidth + margin.left + margin.right)
        .attr("height", chartHeight + margin.top + margin.bottom);

    chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    xScale = d3.scaleLinear()
        .domain(d3.extent(years))
        .range([0, chartWidth]);

    yScale = d3.scaleLinear()
        .domain([
            Math.min(-1, d3.min(rawData.filter(d => categories.includes(d.category)), d => d.value) - 0.5),
            d3.max(rawData.filter(d => categories.includes(d.category)), d => d.value) + 0.5
        ])
        .nice()
        .range([chartHeight, 0]);

    gridGroup = chartGroup.append("g").attr("class", "grid");

    xAxisGroup = chartGroup.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${chartHeight})`);

    yAxisGroup = chartGroup.append("g")
        .attr("class", "axis");

    zeroLine = chartGroup.append("line")
        .attr("class", "zero-line");

    lineGroup = chartGroup.append("g");

    selectedYearGroup = chartGroup.append("g");
    selectedYearLine = selectedYearGroup.append("line").attr("class", "selected-line");
    selectedYearDots = selectedYearGroup.append("g");

    hoverGroup = chartGroup.append("g").style("display", "none");

    hoverLine = hoverGroup.append("line")
        .attr("class", "hover-line")
        .attr("y1", 0)
        .attr("y2", chartHeight);

    hoverDots = hoverGroup.append("g");

    overlayRect = chartGroup.append("rect")
        .attr("class", "chart-click-target")
        .attr("fill", "transparent")
        .attr("pointer-events", "all")
        .on("mouseenter", () => {
            hoverGroup.style("display", null);
            tooltip.style("opacity", 1);
        })
        .on("mouseleave", () => {
            hoverGroup.style("display", "none");
            tooltip.style("opacity", 0);
        })
        .on("mousemove", handleHoverMove)
        .on("click", handleChartClick);

    tooltip = chartContainer.append("div")
        .attr("class", "tooltip multi-tooltip");
}

function renderLegend() {
    legendContainer.selectAll("*").remove();

    const legendOrder = ["all", "food", "shelter", "transportation"]
        .filter(category => categories.includes(category));

    legendOrder.forEach(category => {
        const item = legendContainer.append("div").attr("class", "legend-item");
        item.append("span")
            .attr("class", "legend-swatch")
            .style("background", colors[category] || "#999");
        item.append("span").text(prettyNames[category] || category);
    });
}

function updateAll() {
    updateChart();
    renderCards();
    updateStats();
    updateComparison();
    updateSelectedYearMarker();
}

function updateChart() {
    xScale.range([0, chartWidth]);
    yScale.range([chartHeight, 0]);

    gridGroup.call(
        d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat("")
    );

    xAxisGroup.call(
        d3.axisBottom(xScale)
            .tickFormat(d3.format("d"))
            .ticks(Math.min(years.length, 8))
    );

    yAxisGroup.call(
        d3.axisLeft(yScale)
            .ticks(6)
            .tickFormat(d => `${d}%`)
    );

    zeroLine
        .attr("x1", 0)
        .attr("x2", chartWidth)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0));

    const line = d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    const series = categories.map(category => ({
        category,
        values: groupedData.get(category).sort((a, b) => a.year - b.year)
    }));

    const paths = lineGroup.selectAll(".line-path")
        .data(series, d => d.category);

    paths.enter()
        .append("path")
        .attr("class", "line-path")
        .merge(paths)
        .attr("stroke", d => colors[d.category] || "#999")
        .attr("d", d => line(d.values));

    paths.exit().remove();

    overlayRect
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    hoverLine
        .attr("y1", 0)
        .attr("y2", chartHeight);

    selectedYearLine
        .attr("y1", 0)
        .attr("y2", chartHeight);

    updateSelectedYearMarker();
}

function handleHoverMove(event) {
    const [mx] = d3.pointer(event);
    const clampedYear = getNearestYear(mx);

    const yearData = getYearData(clampedYear);

    hoverLine
        .attr("x1", xScale(clampedYear))
        .attr("x2", xScale(clampedYear));

    const dots = hoverDots.selectAll("circle")
        .data(yearData.filter(d => d.value !== null), d => d.category);

    dots.enter()
        .append("circle")
        .attr("r", 5)
        .merge(dots)
        .attr("cx", d => xScale(clampedYear))
        .attr("cy", d => yScale(d.value))
        .attr("fill", d => colors[d.category] || "#999")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);

    dots.exit().remove();

    const ordered = ["all", "food", "shelter", "transportation"]
        .filter(c => categories.includes(c))
        .map(category => yearData.find(d => d.category === category))
        .filter(Boolean);

    tooltip.html(`
        <div class="tooltip-title">${clampedYear}</div>
        ${ordered.map(d => `
            <div class="tooltip-row">
                <span class="tooltip-label">
                    <span class="tooltip-dot" style="background:${colors[d.category]}"></span>
                    ${prettyNames[d.category]}
                </span>
                <span class="tooltip-value">${d.value.toFixed(1)}%</span>
            </div>
        `).join("")}
    `);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;

    let left = xScale(clampedYear) + margin.left + 18;
    let top = 24;

    if (left + tooltipWidth > chartWidth + margin.left) {
        left = xScale(clampedYear) + margin.left - tooltipWidth - 18;
    }

    if (left < margin.left) {
        left = margin.left + 10;
    }

    if (top + tooltipHeight > chartHeight + margin.top) {
        top = chartHeight + margin.top - tooltipHeight - 10;
    }

    tooltip
        .style("left", `${left}px`)
        .style("top", `${top}px`)
        .style("opacity", 1);
}

function handleChartClick(event) {
    const [mx] = d3.pointer(event);
    const clickedYear = getNearestYear(mx);
    updateSelectedYear(clickedYear);
}

function getNearestYear(mouseX) {
    const hoveredYear = Math.round(xScale.invert(mouseX));
    return Math.max(years[0], Math.min(years[years.length - 1], hoveredYear));
}

function getYearData(year) {
    return categories.map(category => {
        const row = groupedData.get(category)?.find(d => d.year === year);
        return {
            category,
            value: row ? row.value : null
        };
    });
}

function updateSelectedYear(year) {
    yearSlider.value = year;
    updateYearLabel();
    renderCards();
    updateStats();
    updateComparison();
    updateSelectedYearMarker();
}

function updateYearLabel() {
    yearLabel.textContent = `${yearSlider.value}`;
}

function updateSelectedYearMarker() {
    const selectedYear = +yearSlider.value;

    selectedYearLine
        .attr("x1", xScale(selectedYear))
        .attr("x2", xScale(selectedYear));

    const yearData = getYearData(selectedYear).filter(d => d.value !== null);

    const dots = selectedYearDots.selectAll("circle")
        .data(yearData, d => d.category);

    dots.enter()
        .append("circle")
        .attr("class", "selected-dot")
        .attr("r", 6)
        .merge(dots)
        .attr("cx", d => xScale(selectedYear))
        .attr("cy", d => yScale(d.value))
        .attr("fill", d => colors[d.category] || "#999");

    dots.exit().remove();
}

function renderCards() {
    const selectedYear = +yearSlider.value;

    const cardOrder = ["all", "shelter", "food", "transportation"]
        .filter(category => categories.includes(category));

    const cardData = cardOrder.map(category => {
        const row = groupedData.get(category)?.find(d => d.year === selectedYear);
        return {
            category,
            value: row ? row.value : null
        };
    });

    categoryCards.selectAll("*").remove();

    const cards = categoryCards.selectAll(".category-card")
        .data(cardData)
        .enter()
        .append("div")
        .attr("class", "category-card");

    cards.append("div")
        .attr("class", "category-card-title")
        .text(d => prettyNames[d.category] || d.category);

    cards.append("div")
        .attr("class", "category-card-value")
        .style("color", d => colors[d.category] || "#999")
        .text(d => d.value !== null ? `${d.value.toFixed(1)}%` : "—");

    cards.append("div")
        .attr("class", "category-card-sub")
        .text(d => d.value !== null ? `${selectedYear}` : "No data");
}

function updateStats() {
    const selectedYear = +yearSlider.value;
    const official = getValue("all", selectedYear);
    officialRate.textContent = `${official.toFixed(1)}%`;
}

function getValue(category, year) {
    const row = groupedData.get(category)?.find(d => d.year === year);
    return row ? row.value : 0;
}

function getPersonalRate(year) {
    const shelterRate = getValue("shelter", year);
    const foodRate = getValue("food", year);
    const transportRate = getValue("transportation", year);
    const allRate = getValue("all", year);

    return (
        (+housingSlider.value / 100) * shelterRate +
        (+foodSlider.value / 100) * foodRate +
        (+transportSlider.value / 100) * transportRate +
        (+otherSlider.value / 100) * allRate
    );
}

function updateComparison() {
    const selectedYear = +yearSlider.value;
    const official = getValue("all", selectedYear);
    const personal = getPersonalRate(selectedYear);

    const minRate = Math.min(0, official, personal);
    const maxRate = Math.max(official, personal, 1);

    const scaleHeight = d3.scaleLinear()
        .domain([minRate, maxRate])
        .range([30, 220]);

    officialBar.style.height = `${scaleHeight(official)}px`;
    personalBar.style.height = `${scaleHeight(personal)}px`;

    officialBarLabel.textContent = `${official.toFixed(1)}%`;
    personalBarLabel.textContent = `${personal.toFixed(1)}%`;

    const diff = personal - official;

    if (Math.abs(diff) < 0.2) {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is almost identical to the official inflation rate. Your spending mix tracks the overall CPI fairly closely.`;
    } else if (diff > 0) {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is ${diff.toFixed(1)} percentage points above the official inflation rate. Because more of your spending is concentrated in faster-rising categories, inflation is likely to feel more severe than the headline number suggests.`;
    } else {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is ${Math.abs(diff).toFixed(1)} percentage points below the official inflation rate. Your spending mix is less exposed to the categories with the strongest price increases.`;
    }

    updateStats();
}

function handleResize() {
    const newWidth = chartContainer.node().getBoundingClientRect().width - margin.left - margin.right;
    if (newWidth <= 0) return;

    chartWidth = newWidth;

    svg
        .attr("width", chartWidth + margin.left + margin.right)
        .attr("height", chartHeight + margin.top + margin.bottom);

    updateChart();
}
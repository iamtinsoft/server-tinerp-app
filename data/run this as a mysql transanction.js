//run this as a mysql transanction

try {
    const query = `
            UPDATE tenants
            SET tenant_name = ?, tenant_email = ?, tenant_icon_url = ?, plan_id = ?, subscription_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = ?
        `;
    const [result] = await db.execute(query, [
        tenant_name,
        tenant_email,
        tenant_icon_url || null,
        plan_id,
        subscription_id,
        status || "Active",
        id,
    ]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Tenant not found" });
    }

    res.status(200).json({ message: "Tenant updated successfully" });
} catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ message: "Tenant name or email must be unique", error });
    } else {
        console.error(error);
        res.status(500).json({ message: "Error updating tenant", error });
    }
}

try {
    // Check if the new tenant_id and plan_id combination already exists (excluding current subscription)
    // const checkQuery = `
    //     SELECT * FROM subscriptions WHERE tenant_id = ? AND plan_id = ? AND subscription_id != ?
    // `;
    // const [existing] = await db.query(checkQuery, [tenant_id, plan_id, id]);

    // if (existing.length > 0) {
    //     return res.status(400).json({ message: "This tenant-plan combination already exists" });
    // }

    const query = `
            UPDATE subscriptions
            SET tenant_id = ?, plan_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = ?
        `;
    const [result] = await db.execute(query, [tenant_id, plan_id, status || "Active", id]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Subscription not found" });
    }

    res.status(200).json({ message: "Subscription updated successfully" });
} catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating subscription", error });
}